import type {DraekzModelInfo} from "typings/draekz.js";
import {ModelInfoType, draekzApi} from "./draekz_api.js";
import {api} from "scripts/api.js";

/**
 * Abstract class defining information syncing for different types.
 */
abstract class BaseModelInfoService extends EventTarget {
  private readonly fileToInfo = new Map<string, DraekzModelInfo | null>();
  protected abstract readonly modelInfoType: ModelInfoType;

  protected abstract readonly apiRefreshEventString: string;

  constructor() {
    super();
    this.init();
  }

  private init() {
    api.addEventListener(
      this.apiRefreshEventString,
      this.handleAsyncUpdate.bind(this) as EventListener,
    );
  }

  async getInfo(file: string, refresh: boolean, light: boolean) {
    if (this.fileToInfo.has(file) && !refresh) {
      return this.fileToInfo.get(file)!;
    }
    return this.fetchInfo(file, refresh, light);
  }

  async refreshInfo(file: string) {
    return this.fetchInfo(file, true);
  }

  async clearFetchedInfo(file: string) {
    await draekzApi.clearModelsInfo({type: this.modelInfoType, files: [file]});
    this.fileToInfo.delete(file);
    return null;
  }

  async savePartialInfo(file: string, data: Partial<DraekzModelInfo>) {
    let info = await draekzApi.saveModelInfo(this.modelInfoType, file, data);
    this.fileToInfo.set(file, info);
    return info;
  }

  handleAsyncUpdate(event: CustomEvent<{data: DraekzModelInfo}>) {
    const info = event.detail?.data as DraekzModelInfo;
    if (info?.file) {
      this.setFreshInfo(info.file, info);
    }
  }

  private async fetchInfo(file: string, refresh = false, light = false) {
    let info = null;
    if (!refresh) {
      info = await draekzApi.getModelsInfo({type: this.modelInfoType, files: [file], light});
    } else {
      info = await draekzApi.refreshModelsInfo({type: this.modelInfoType, files: [file]});
    }
    info = info?.[0] ?? null;
    if (!light) {
      this.fileToInfo.set(file, info);
    }
    return info;
  }

  /**
   * Single point to set data into the info cache, and fire an event. Note, this doesn't determine
   * if the data is actually different.
   */
  private setFreshInfo(file: string, info: DraekzModelInfo) {
    this.fileToInfo.set(file, info);
    // this.dispatchEvent(
    //   new CustomEvent("draekz-model-service-lora-details", { detail: { lora: info } }),
    // );
  }
}

/**
 * Lora type implementation of ModelInfoTypeService.
 */
class LoraInfoService extends BaseModelInfoService {
  protected override readonly apiRefreshEventString = "draekz-refreshed-loras-info";
  protected override readonly modelInfoType = 'loras';
}

/**
 * Checkpoint type implementation of ModelInfoTypeService.
 */
class CheckpointInfoService extends BaseModelInfoService {
  protected override readonly apiRefreshEventString = "draekz-refreshed-checkpoints-info";
  protected override readonly modelInfoType = 'checkpoints';
}

export const LORA_INFO_SERVICE = new LoraInfoService();
export const CHECKPOINT_INFO_SERVICE = new CheckpointInfoService();
