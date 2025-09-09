import { draekzConfig } from "../../../draekz/config.js";
import { getObjectValue, setObjectValue } from "../../../draekz/common/shared_utils.js";
import { draekzApi } from "../../../draekz/common/draekz_api.js";
class ConfigService extends EventTarget {
    getConfigValue(key, def) {
        return getObjectValue(draekzConfig, key, def);
    }
    getFeatureValue(key, def) {
        key = "features." + key.replace(/^features\./, "");
        return getObjectValue(draekzConfig, key, def);
    }
    async setConfigValues(changed) {
        const body = new FormData();
        body.append("json", JSON.stringify(changed));
        const response = await draekzApi.fetchJson("/config", { method: "POST", body });
        if (response.status === "ok") {
            for (const [key, value] of Object.entries(changed)) {
                setObjectValue(draekzConfig, key, value);
                this.dispatchEvent(new CustomEvent("config-change", { detail: { key, value } }));
            }
        }
        else {
            return false;
        }
        return true;
    }
}
export const SERVICE = new ConfigService();
