import {DraekzDialog, DraekzDialogOptions} from "draekz/common/dialog.js";
import {
  createElement as $el,
  empty,
  appendChildren,
  getClosestOrSelf,
  query,
  queryAll,
  setAttributes,
} from "draekz/common/utils_dom.js";
import {
  logoCivitai,
  link,
  pencilColored,
  diskColored,
  dotdotdot,
} from "draekz/common/media/svgs.js";
import {DraekzModelInfo} from "typings/draekz.js";
import {CHECKPOINT_INFO_SERVICE, LORA_INFO_SERVICE} from "draekz/common/model_info_service.js";
import {draekz} from "./draekz.js";
import {MenuButton} from "draekz/common/menu.js";
import {generateId, injectCss} from "draekz/common/shared_utils.js";
import {draekzApi} from "draekz/common/draekz_api.js";

/**
 * A dialog that displays information about a model/lora/etc.
 */
abstract class DraekzInfoDialog extends DraekzDialog {
  private modifiedModelData = false;
  private modelInfo: DraekzModelInfo | null = null;

  constructor(file: string) {
    const dialogOptions: DraekzDialogOptions = {
      class: "draekz-info-dialog",
      title: `<h2>Loading...</h2>`,
      content: "<center>Loading..</center>",
      onBeforeClose: () => {
        return true;
      },
    };
    super(dialogOptions);
    this.init(file);
  }

  abstract getModelInfo(file: string): Promise<DraekzModelInfo | null>;
  abstract refreshModelInfo(file: string): Promise<DraekzModelInfo | null>;
  abstract clearModelInfo(file: string): Promise<DraekzModelInfo | null>;

  private async init(file: string) {
    const cssPromise = injectCss("draekz/common/css/dialog_model_info.css");
    this.modelInfo = await this.getModelInfo(file);
    await cssPromise;
    this.setContent(this.getInfoContent());
    this.setTitle(this.modelInfo?.["name"] || this.modelInfo?.["file"] || "Unknown");
    this.attachEvents();
  }

  protected override getCloseEventDetail(): {detail: any} {
    const detail = {
      dirty: this.modifiedModelData,
    };
    return {detail};
  }

  private attachEvents() {
    this.contentElement.addEventListener("click", async (e: MouseEvent) => {
      const target = getClosestOrSelf(e.target as HTMLElement, "[data-action]");
      const action = target?.getAttribute("data-action");
      if (!target || !action) {
        return;
      }
      await this.handleEventAction(action, target, e);
    });
  }

  private async handleEventAction(action: string, target: HTMLElement, e?: Event) {
    const info = this.modelInfo!;
    if (!info?.file) {
      return;
    }
    if (action === "fetch-civitai") {
      this.modelInfo = await this.refreshModelInfo(info.file);
      this.setContent(this.getInfoContent());
      this.setTitle(this.modelInfo?.["name"] || this.modelInfo?.["file"] || "Unknown");
    } else if (action === "copy-trained-words") {
      const selected = queryAll(".-draekz-is-selected", target.closest("tr")!);
      const text = selected.map((el) => el.getAttribute("data-word")).join(", ");
      await navigator.clipboard.writeText(text);
      draekz.showMessage({
        id: "copy-trained-words-" + generateId(4),
        type: "success",
        message: `Successfully copied ${selected.length} key word${
          selected.length === 1 ? "" : "s"
        }.`,
        timeout: 4000,
      });
    } else if (action === "toggle-trained-word") {
      target?.classList.toggle("-draekz-is-selected");
      const tr = target.closest("tr");
      if (tr) {
        const span = query("td:first-child > *", tr)!;
        let small = query("small", span);
        if (!small) {
          small = $el("small", {parent: span});
        }
        const num = queryAll(".-draekz-is-selected", tr).length;
        small.innerHTML = num
          ? `${num} selected | <span role="button" data-action="copy-trained-words">Copy</span>`
          : "";
        // this.handleEventAction('copy-trained-words', target, e);
      }
    } else if (action === "edit-row") {
      const tr = target!.closest("tr")!;
      const td = query("td:nth-child(2)", tr)!;
      const input = td.querySelector("input,textarea");
      if (!input) {
        const fieldName = tr.dataset["fieldName"] as string;
        tr.classList.add("-draekz-editing");
        const isTextarea = fieldName === "userNote";
        const input = $el(`${isTextarea ? "textarea" : 'input[type="text"]'}`, {
          value: td.textContent,
        });
        input.addEventListener("keydown", (e) => {
          if (!isTextarea && e.key === "Enter") {
            const modified = saveEditableRow(info!, tr, true);
            this.modifiedModelData = this.modifiedModelData || modified;
            e.stopPropagation();
            e.preventDefault();
          } else if (e.key === "Escape") {
            const modified = saveEditableRow(info!, tr, false);
            this.modifiedModelData = this.modifiedModelData || modified;
            e.stopPropagation();
            e.preventDefault();
          }
        });
        appendChildren(empty(td), [input]);
        input.focus();
      } else if (target!.nodeName.toLowerCase() === "button") {
        const modified = saveEditableRow(info!, tr, true);
        this.modifiedModelData = this.modifiedModelData || modified;
      }
      e?.preventDefault();
      e?.stopPropagation();
    }
  }

  private getInfoContent() {
    const info = this.modelInfo || {};
    const civitaiLink = info.links?.find((i) => i.includes("civitai.com/models"));
    const html = `
      <ul class="draekz-info-area">
        <li title="Type" class="draekz-info-tag -type -type-${(
          info.type || ""
        ).toLowerCase()}"><span>${info.type || ""}</span></li>
        <li title="Base Model" class="draekz-info-tag -basemodel -basemodel-${(
          info.baseModel || ""
        ).toLowerCase()}"><span>${info.baseModel || ""}</span></li>
        <li class="draekz-info-menu" stub="menu"></li>
        ${
          ""
          //   !civitaiLink
          //     ? ""
          //     : `
          //   <li title="Visit on Civitai" class="-link -civitai"><a href="${civitaiLink}" target="_blank">Civitai ${link}</a></li>
          // `
        }
      </ul>

      <table class="draekz-info-table">
        ${infoTableRow("File", info.file || "")}
        ${infoTableRow("Hash (sha256)", info.sha256 || "")}
        ${
          civitaiLink
            ? infoTableRow(
                "Civitai",
                `<a href="${civitaiLink}" target="_blank">${logoCivitai}View on Civitai</a>`,
              )
            : info.raw?.civitai?.error === "Model not found"
              ? infoTableRow(
                  "Civitai",
                  '<i>Model not found</i> <span class="-help" title="The model was not found on civitai with the sha256 hash. It\'s possible the model was removed, re-uploaded, or was never on civitai to begin with."></span>',
                )
              : info.raw?.civitai?.error
                ? infoTableRow("Civitai", info.raw?.civitai?.error)
                : !info.raw?.civitai
                  ? infoTableRow(
                      "Civitai",
                      `<button class="draekz-button" data-action="fetch-civitai">Fetch info from civitai</button>`,
                    )
                  : ""
        }

        ${infoTableRow(
          "Name",
          info.name || info.raw?.metadata?.ss_output_name || "",
          "The name for display.",
          "name",
        )}

        ${
          !info.baseModelFile && !info.baseModelFile
            ? ""
            : infoTableRow(
                "Base Model",
                (info.baseModel || "") + (info.baseModelFile ? ` (${info.baseModelFile})` : ""),
              )
        }


        ${
          !info.trainedWords?.length
            ? ""
            : infoTableRow(
                "Trained Words",
                getTrainedWordsMarkup(info.trainedWords) ?? "",
                "Trained words from the metadata and/or civitai. Click to select for copy.",
              )
        }

        ${
          !info.raw?.metadata?.ss_clip_skip || info.raw?.metadata?.ss_clip_skip == "None"
            ? ""
            : infoTableRow("Clip Skip", info.raw?.metadata?.ss_clip_skip)
        }
        ${infoTableRow(
          "Strength Min",
          info.strengthMin ?? "",
          "The recommended minimum strength, In the Lora Loader node, strength will signal when it is below this threshold.",
          "strengthMin",
        )}
        ${infoTableRow(
          "Strength Max",
          info.strengthMax ?? "",
          "The recommended maximum strength. In the Lora Loader node, strength will signal when it is above this threshold.",
          "strengthMax",
        )}
        ${
          "" /*infoTableRow(
          "User Tags",
          info.userTags?.join(", ") ?? "",
          "A list of tags to make filtering easier  in the Lora Chooser.",
          "userTags",
        )*/
        }
        ${infoTableRow(
          "Additional Notes",
          info.userNote ?? "",
          "Additional notes you'd like to keep and reference in the info dialog.",
          "userNote",
        )}

      </table>

      <ul class="draekz-info-images">${
        info.images
          ?.map(
            (img) => `
        <li>
          <figure>${
            img.type === 'video'
              ? `<video src="${img.url}" autoplay loop></video>`
              : `<img src="${img.url}" />`
            }
            <figcaption><!--
              -->${imgInfoField(
                "",
                img.civitaiUrl
                  ? `<a href="${img.civitaiUrl}" target="_blank">civitai${link}</a>`
                  : undefined,
              )}<!--
              -->${imgInfoField("seed", img.seed)}<!--
              -->${imgInfoField("steps", img.steps)}<!--
              -->${imgInfoField("cfg", img.cfg)}<!--
              -->${imgInfoField("sampler", img.sampler)}<!--
              -->${imgInfoField("model", img.model)}<!--
              -->${imgInfoField("positive", img.positive)}<!--
              -->${imgInfoField("negative", img.negative)}<!--
            --><!--${
              ""
              //   img.resources?.length
              //     ? `
              //   <tr><td>Resources</td><td><ul>
              //   ${(img.resources || [])
              //     .map(
              //       (r) => `
              //     <li>[${r.type || ""}] ${r.name || ""} ${
              //       r.weight != null ? `@ ${r.weight}` : ""
              //     }</li>
              //   `,
              //     )
              //     .join("")}
              //   </ul></td></tr>
              // `
              //     : ""
            }--></figcaption>
          </figure>
        </li>`,
          )
          .join("") ?? ""
      }</ul>
    `;

    const div = $el("div", {html});

    if (draekz.isDevMode()) {
      setAttributes(query('[stub="menu"]', div)!, {
        children: [
          new MenuButton({
            icon: dotdotdot,
            options: [
              {label: "More Actions", type: "title"},
              {
                label: "Open API JSON",
                callback: async (e: PointerEvent) => {
                  if (this.modelInfo?.file) {
                    window.open(
                      `draekz/api/loras/info?file=${encodeURIComponent(this.modelInfo.file)}`,
                    );
                  }
                },
              },
              {
                label: "Clear all local info",
                callback: async (e: PointerEvent) => {
                  if (this.modelInfo?.file) {
                    this.modelInfo = await LORA_INFO_SERVICE.clearFetchedInfo(this.modelInfo.file);
                    this.setContent(this.getInfoContent());
                    this.setTitle(
                      this.modelInfo?.["name"] || this.modelInfo?.["file"] || "Unknown",
                    );
                  }
                },
              },
            ],
          }),
        ],
      });
    }

    return div;
  }
}

export class DraekzLoraInfoDialog extends DraekzInfoDialog {
  override async getModelInfo(file: string) {
    return LORA_INFO_SERVICE.getInfo(file, false, false);
  }
  override async refreshModelInfo(file: string) {
    return LORA_INFO_SERVICE.refreshInfo(file);
  }
  override async clearModelInfo(file: string) {
    return LORA_INFO_SERVICE.clearFetchedInfo(file);
  }
}

export class DraekzCheckpointInfoDialog extends DraekzInfoDialog {
  override async getModelInfo(file: string) {
    return CHECKPOINT_INFO_SERVICE.getInfo(file, false, false);
  }
  override async refreshModelInfo(file: string) {
    return CHECKPOINT_INFO_SERVICE.refreshInfo(file);
  }
  override async clearModelInfo(file: string) {
    return CHECKPOINT_INFO_SERVICE.clearFetchedInfo(file);
  }
}

/**
 * Generates a uniform markup string for a table row.
 */
function infoTableRow(
  name: string,
  value: string | number,
  help: string = "",
  editableFieldName = "",
) {
  return `
    <tr class="${editableFieldName ? "editable" : ""}" ${
      editableFieldName ? `data-field-name="${editableFieldName}"` : ""
    }>
      <td><span>${name} ${help ? `<span class="-help" title="${help}"></span>` : ""}<span></td>
      <td ${editableFieldName ? "" : 'colspan="2"'}>${
        String(value).startsWith("<") ? value : `<span>${value}<span>`
      }</td>
      ${
        editableFieldName
          ? `<td style="width: 24px;"><button class="draekz-button-reset draekz-button-edit" data-action="edit-row">${pencilColored}${diskColored}</button></td>`
          : ""
      }
    </tr>`;
}

function getTrainedWordsMarkup(words: DraekzModelInfo["trainedWords"]) {
  let markup = `<ul class="draekz-info-trained-words-list">`;
  for (const wordData of words || []) {
    markup += `<li title="${wordData.word}" data-word="${
      wordData.word
    }" class="draekz-info-trained-words-list-item" data-action="toggle-trained-word">
      <span>${wordData.word}</span>
      ${wordData.civitai ? logoCivitai : ""}
      ${wordData.count != null ? `<small>${wordData.count}</small>` : ""}
    </li>`;
  }
  markup += `</ul>`;
  return markup;
}

/**
 * Saves / cancels an editable row. Returns a boolean if the data was modified.
 */
function saveEditableRow(info: DraekzModelInfo, tr: HTMLElement, saving = true): boolean {
  const fieldName = tr.dataset["fieldName"] as "file";
  const input = query<HTMLInputElement>("input,textarea", tr)!;
  let newValue = info[fieldName] ?? "";
  let modified = false;
  if (saving) {
    newValue = input!.value;
    if (fieldName.startsWith("strength")) {
      if (Number.isNaN(Number(newValue))) {
        alert(`You must enter a number into the ${fieldName} field.`);
        return false;
      }
      newValue = (Math.round(Number(newValue) * 100) / 100).toFixed(2);
    }
    LORA_INFO_SERVICE.savePartialInfo(info.file!, {[fieldName]: newValue});
    modified = true;
  }
  tr.classList.remove("-draekz-editing");
  const td = query("td:nth-child(2)", tr)!;
  appendChildren(empty(td), [$el("span", {text: newValue})]);
  return modified;
}

function imgInfoField(label: string, value?: string | number) {
  return value != null ? `<span>${label ? `<label>${label} </label>` : ""}${value}</span>` : "";
}
