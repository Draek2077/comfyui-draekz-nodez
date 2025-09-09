import { createElement as $el, getClosestOrSelf, setAttributes } from "./utils_dom.js";
export class DraekzDialog extends EventTarget {
    constructor(options) {
        super();
        this.options = options;
        let container = $el("div.draekz-dialog-container");
        this.element = $el("dialog", {
            classes: ["draekz-dialog", options.class || ""],
            child: container,
            parent: document.body,
            events: {
                click: (event) => {
                    if (!this.element.open ||
                        event.target === container ||
                        getClosestOrSelf(event.target, `.draekz-dialog-container`) === container) {
                        return;
                    }
                    return this.close();
                },
            },
        });
        this.element.addEventListener("close", (event) => {
            this.onDialogElementClose();
        });
        this.titleElement = $el("div.draekz-dialog-container-title", {
            parent: container,
            children: !options.title
                ? null
                : options.title instanceof Element || Array.isArray(options.title)
                    ? options.title
                    : typeof options.title === "string"
                        ? !options.title.includes("<h2")
                            ? $el("h2", { html: options.title })
                            : options.title
                        : options.title,
        });
        this.contentElement = $el("div.draekz-dialog-container-content", {
            parent: container,
            child: options.content,
        });
        const footerEl = $el("footer.draekz-dialog-container-footer", { parent: container });
        for (const button of options.buttons || []) {
            $el("button", {
                text: button.label,
                className: button.className,
                disabled: !!button.disabled,
                parent: footerEl,
                events: {
                    click: (e) => {
                        var _a;
                        (_a = button.callback) === null || _a === void 0 ? void 0 : _a.call(button, e);
                    },
                },
            });
        }
        if (options.closeButtonLabel !== false) {
            $el("button", {
                text: options.closeButtonLabel || "Close",
                className: "draekz-button",
                parent: footerEl,
                events: {
                    click: (e) => {
                        this.close(e);
                    },
                },
            });
        }
    }
    setTitle(content) {
        const title = typeof content !== "string" || content.includes("<h2")
            ? content
            : $el("h2", { html: content });
        setAttributes(this.titleElement, { children: title });
    }
    setContent(content) {
        setAttributes(this.contentElement, { children: content });
    }
    show() {
        document.body.classList.add("draekz-dialog-open");
        this.element.showModal();
        this.dispatchEvent(new CustomEvent("show"));
        return this;
    }
    async close(e) {
        if (this.options.onBeforeClose && !(await this.options.onBeforeClose())) {
            return;
        }
        this.element.close();
    }
    onDialogElementClose() {
        document.body.classList.remove("draekz-dialog-open");
        this.element.remove();
        this.dispatchEvent(new CustomEvent("close", this.getCloseEventDetail()));
    }
    getCloseEventDetail() {
        return { detail: null };
    }
}
export class DraekzHelpDialog extends DraekzDialog {
    constructor(node, content, opts = {}) {
        const title = (node.type || node.title || "").replace(/\s*\(draekz\).*/, " <small>by draekz</small>");
        const options = Object.assign({}, opts, {
            class: "-iconed -help",
            title,
            content,
        });
        super(options);
    }
}
