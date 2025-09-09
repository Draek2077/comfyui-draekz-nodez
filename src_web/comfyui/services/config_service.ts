// @ts-ignore
import {draekzConfig} from "draekz/config.js";
import {getObjectValue, setObjectValue} from "draekz/common/shared_utils.js";
import {draekzApi} from "draekz/common/draekz_api.js";

/**
 * A singleton service exported as `SERVICE` to handle configuration routines.
 */
class ConfigService extends EventTarget {
  getConfigValue(key: string, def?: any) {
    return getObjectValue(draekzConfig, key, def);
  }

  getFeatureValue(key: string, def?: any) {
    key = "features." + key.replace(/^features\./, "");
    return getObjectValue(draekzConfig, key, def);
  }

  /**
   * Given an object of key:value changes it will send to the server and wait for a successful
   * response before setting the values on the local draekzConfig.
   */
  async setConfigValues(changed: {[key: string]: any}) {
    const body = new FormData();
    body.append("json", JSON.stringify(changed));
    const response = await draekzApi.fetchJson("/config", {method: "POST", body});
    if (response.status === "ok") {
      for (const [key, value] of Object.entries(changed)) {
        setObjectValue(draekzConfig, key, value);
        this.dispatchEvent(new CustomEvent("config-change", {detail: {key, value}}));
      }
    } else {
      return false;
    }
    return true;
  }
}

/** The ConfigService singleton. */
export const SERVICE = new ConfigService();
