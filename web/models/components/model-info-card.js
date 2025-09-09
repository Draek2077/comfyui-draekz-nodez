import { DraekzCustomElement } from "../../common/components/base_custom_element.js";
export class DraekzModelInfoCard extends DraekzCustomElement {
    constructor() {
        super(...arguments);
        this.data = {};
    }
    getModified(value, data, currentElement, contextElement) {
        const date = new Date(value);
        return String(`${date.toLocaleDateString()} ${date.toLocaleTimeString()}`);
    }
    getCivitaiLink(links) {
        return (links === null || links === void 0 ? void 0 : links.find((i) => i.includes("civitai.com/models"))) || null;
    }
    setModelData(data) {
        this.data = data;
    }
    hasBaseModel(baseModel) {
        return this.data.baseModel === baseModel;
    }
    hasData(field) {
        var _a;
        if (field === "civitai") {
            return !!((_a = this.getCivitaiLink(this.data.links)) === null || _a === void 0 ? void 0 : _a.length);
        }
        return !!this.data[field];
    }
    matchesQueryText(query) {
        var _a;
        return (_a = (this.data.name || this.data.file)) === null || _a === void 0 ? void 0 : _a.includes(query);
    }
    hide() {
        this.classList.add("-is-hidden");
    }
    show() {
        this.classList.remove("-is-hidden");
    }
}
DraekzModelInfoCard.NAME = "draekz-model-info-card";
DraekzModelInfoCard.TEMPLATES = "components/model-info-card.html";
DraekzModelInfoCard.CSS = "components/model-info-card.css";
DraekzModelInfoCard.USE_SHADOW = false;
