import type {
  LGraphCanvas as TLGraphCanvas,
  LGraphNode,
  IContextMenuValue,
  LGraph as TLGraph,
  IContextMenuOptions,
  ISerialisedGraph,
  CanvasMouseEvent,
  CanvasPointerExtensions,
  NodeId,
  ISerialisedNode,
} from "@comfyorg/frontend";
import type {ComfyApiFormat, ComfyApiPrompt} from "typings/comfy.js";
import type {ComfyApp} from "@comfyorg/frontend";

import {app} from "scripts/app.js";
import {api} from "scripts/api.js";
import {SERVICE as CONFIG_SERVICE} from "./services/config_service.js";
import {SERVICE as BOOKMARKS_SERVICE} from "./services/bookmarks_services.js";
import {SERVICE as KEY_EVENT_SERVICE} from "./services/key_events_services.js";
import {WorkflowLinkFixer} from "draekz/common/link_fixer.js";
import {injectCss, wait} from "draekz/common/shared_utils.js";
import {replaceNode, waitForCanvas, waitForGraph} from "./utils.js";
import {NodeTypesString, addDraekz, getNodeTypeStrings} from "./constants.js";
import {DraekzConfigDialog} from "./config.js";
import {
  iconGear,
  iconNode,
  iconReplace,
  iconStarFilled,
  logoDraekz,
} from "draekz/common/media/svgs.js";
import {createElement, queryAll, query} from "draekz/common/utils_dom.js";

export enum LogLevel {
  IMPORTANT = 1,
  ERROR,
  WARN,
  INFO,
  DEBUG,
  DEV,
}

const LogLevelKeyToLogLevel: {[key: string]: LogLevel} = {
  IMPORTANT: LogLevel.IMPORTANT,
  ERROR: LogLevel.ERROR,
  WARN: LogLevel.WARN,
  INFO: LogLevel.INFO,
  DEBUG: LogLevel.DEBUG,
  DEV: LogLevel.DEV,
};

type ConsoleLogFns = "log" | "error" | "warn" | "debug" | "info";
const LogLevelToMethod: {[key in LogLevel]: ConsoleLogFns} = {
  [LogLevel.IMPORTANT]: "log",
  [LogLevel.ERROR]: "error",
  [LogLevel.WARN]: "warn",
  [LogLevel.INFO]: "info",
  [LogLevel.DEBUG]: "log",
  [LogLevel.DEV]: "log",
};
const LogLevelToCSS: {[key in LogLevel]: string} = {
  [LogLevel.IMPORTANT]: "font-weight: bold; color: blue;",
  [LogLevel.ERROR]: "",
  [LogLevel.WARN]: "",
  [LogLevel.INFO]: "font-style: italic; color: blue;",
  [LogLevel.DEBUG]: "font-style: italic; color: #444;",
  [LogLevel.DEV]: "color: #004b68;",
};

let GLOBAL_LOG_LEVEL = LogLevel.ERROR;

/**
 * At some point in Summer of 2024 ComfyUI broke third-party api calls by assuming api paths follow
 * a certain structure. However, comfyui-draekz-nodez wants an `/draekz/` prefix for that same reason, so
 * we overwrite the apiUrl method to fix.
 */
const apiURL = api.apiURL;
api.apiURL = function (route: string): string {
  if (route.includes("draekz/")) {
    return (this.api_base + "/" + route).replace(/\/\//g, "/");
  }
  return apiURL.apply(this, arguments as any);
};

/**
 * A blocklist of extensions to disallow hooking into draekz's base classes when calling the
 * `draekz.invokeExtensionsAsync` method (which runs outside of ComfyNode's
 * `app.invokeExtensionsAsync` which is private).
 *
 * In Apr 2024 the base draekz node class added support for other extensions using `nodeCreated`
 * and `beforeRegisterNodeDef` which allows other extensions to modify the class. However, since it
 * had been months since divorcing the ComfyNode in comfyui-draekz-nodez due to instability and
 * inflexibility, this was a bit risky as other extensions hadn't ever run with this ability. This
 * list attempts to block extensions from being able to call into comfyui-draekz-nodez nodes via the
 * `nodeCreated` and `beforeRegisterNodeDef` callbacks now that comfyui-draekz-nodez is utilizing them
 * because they do not work. Oddly, it's ComfyUI's own extension that is broken.
 */
const INVOKE_EXTENSIONS_BLOCKLIST = [
  {
    name: "Comfy.WidgetInputs",
    reason:
      "Major conflict with comfyui-draekz-nodez nodes' inputs causing instability and " +
      "repeated link disconnections.",
  },
  {
    name: "efficiency.widgethider",
    reason:
      "Overrides value getter before widget getter is prepared. Can be lifted if/when " +
      "https://github.com/jags111/efficiency-nodes-comfyui/pull/203 is pulled.",
  },
];

/** A basic wrapper around logger. */
class Logger {
  /** Logs a message to the console if it meets the current log level. */
  log(level: LogLevel, message: string, ...args: any[]) {
    const [n, v] = this.logParts(level, message, ...args);
    console[n]?.(...v);
  }

  /**
   * Returns a tuple of the console function and its arguments. Useful for callers to make the
   * actual console.<fn> call to gain benefits of DevTools knowing the source line.
   *
   * If the input is invalid or the level doesn't meet the configuration level, then the return
   * value is an unknown function and empty set of values. Callers can use optionla chaining
   * successfully:
   *
   *     const [fn, values] = logger.logPars(LogLevel.INFO, 'my message');
   *     console[fn]?.(...values); // Will work even if INFO won't be logged.
   *
   */
  logParts(level: LogLevel, message: string, ...args: any[]): [ConsoleLogFns, any[]] {
    if (level <= GLOBAL_LOG_LEVEL) {
      const css = LogLevelToCSS[level] || "";
      if (level === LogLevel.DEV) {
        message = `🔧 ${message}`;
      }
      return [LogLevelToMethod[level], [`%c${message}`, css, ...args]];
    }
    return ["none" as "info", []];
  }
}

/**
 * A log session, with the name as the prefix. A new session will stack prefixes.
 */
class LogSession {
  readonly logger = new Logger();
  readonly logsCache: {[key: string]: {lastShownTime: number}} = {};

  constructor(readonly name?: string) {}

  /**
   * Returns the console log method to use and the arguments to pass so the call site can log from
   * there. This extra work at the call site allows for easier debugging in the dev console.
   *
   *     const [logMethod, logArgs] = logger.logParts(LogLevel.DEBUG, message, ...args);
   *     console[logMethod]?.(...logArgs);
   */
  logParts(level: LogLevel, message?: string, ...args: any[]): [ConsoleLogFns, any[]] {
    message = `${this.name || ""}${message ? " " + message : ""}`;
    return this.logger.logParts(level, message, ...args);
  }

  logPartsOnceForTime(
    level: LogLevel,
    time: number,
    message?: string,
    ...args: any[]
  ): [ConsoleLogFns, any[]] {
    message = `${this.name || ""}${message ? " " + message : ""}`;
    const cacheKey = `${level}:${message}`;
    const cacheEntry = this.logsCache[cacheKey];
    const now = +new Date();
    if (cacheEntry && cacheEntry.lastShownTime + time > now) {
      return ["none" as "info", []];
    }
    const parts = this.logger.logParts(level, message, ...args);
    if (console[parts[0]]) {
      this.logsCache[cacheKey] = this.logsCache[cacheKey] || ({} as {lastShownTime: number});
      this.logsCache[cacheKey]!.lastShownTime = now;
    }
    return parts;
  }

  debugParts(message?: string, ...args: any[]) {
    return this.logParts(LogLevel.DEBUG, message, ...args);
  }

  infoParts(message?: string, ...args: any[]) {
    return this.logParts(LogLevel.INFO, message, ...args);
  }

  warnParts(message?: string, ...args: any[]) {
    return this.logParts(LogLevel.WARN, message, ...args);
  }

  errorParts(message?: string, ...args: any[]) {
    return this.logParts(LogLevel.ERROR, message, ...args);
  }

  newSession(name?: string) {
    return new LogSession(`${this.name}${name}`);
  }
}

export type DraekzUiMessage = {
  id: string;
  message: string;
  type?: "warn" | "info" | "success" | null;
  timeout?: number;
  // closeable?: boolean; // TODO
  actions?: Array<{
    label: string;
    href?: string;
    callback?: (event: MouseEvent) => void;
  }>;
};

/**
 * A global class as 'draekz'; exposed on wiindow. Lots can go in here.
 */
class Draekz extends EventTarget {
  /** Exposes the ComfyUI api instance on draekz. */
  readonly api = api;
  private settingsDialog: DraekzConfigDialog | null = null;
  private draekzCssPromise: Promise<void>;

  /** Stores a node id that we will use to queu only that output node (with `queueOutputNode`). */
  private queueNodeIds: NodeId[] | null = null;

  readonly version = CONFIG_SERVICE.getConfigValue("version");

  logger = new LogSession("[draekz]");

  monitorBadLinksAlerted = false;
  monitorLinkTimeout: number | null = null;

  processingQueue = false;
  /**
   * The API Json currently being loaded, or null. Can be used as a falsy boolean to determine if
   * `app.loadApiJson` is currently executing.
   */
  loadingApiJson: ComfyApiFormat | null = null;
  replacingReroute: NodeId | null = null;
  processingMouseDown = false;
  processingMouseUp = false;
  processingMouseMove = false;
  lastCanvasMouseEvent: CanvasMouseEvent | null = null;

  // Comfy/LiteGraph states so nodes and tell what the hell is going on.
  canvasCurrentlyCopyingToClipboard = false;
  canvasCurrentlyCopyingToClipboardWithMultipleNodes = false;
  initialGraphToPromptSerializedWorkflowBecauseComfyUIBrokeStuff: any = null;

  private readonly isMac: boolean = !!(
    navigator.platform?.toLocaleUpperCase().startsWith("MAC") ||
    (navigator as any).userAgentData?.platform?.toLocaleUpperCase().startsWith("MAC")
  );

  constructor() {
    super();

    const logLevel =
      LogLevelKeyToLogLevel[CONFIG_SERVICE.getConfigValue("log_level")] ?? GLOBAL_LOG_LEVEL;
    this.setLogLevel(logLevel);

    this.initializeGraphAndCanvasHooks();
    this.initializeComfyUIHooks();
    this.initializeContextMenu();

    this.draekzCssPromise = injectCss("extensions/comfyui-draekz-nodez/draekz.css");

    if (CONFIG_SERVICE.getConfigValue("debug.keys_down.enabled")) {
      const elDebugKeydowns = createElement<HTMLDivElement>("div.draekz-debug-keydowns", {
        parent: document.body,
      });
      const updateDebugKeyDown = () => {
        elDebugKeydowns.innerText = Object.keys(KEY_EVENT_SERVICE.downKeys).join(" ");
      };
      KEY_EVENT_SERVICE.addEventListener("keydown", updateDebugKeyDown);
      KEY_EVENT_SERVICE.addEventListener("keyup", updateDebugKeyDown);
    }
  }

  /**
   * Initialize a bunch of hooks into LiteGraph itself so we can either keep state or context on
   * what's happening so nodes can respond appropriately. This is usually to fix broken assumptions
   * in the unowned code [🤮], but sometimes to add features or enhancements too [⭐].
   */
  private async initializeGraphAndCanvasHooks() {
    const draekz = this;

    // [🤮] To mitigate changes from https://github.com/draekz/comfyui-draekz-nodez/issues/69
    // and https://github.com/comfyanonymous/ComfyUI/issues/2193 we can try to store the workflow
    // node so our nodes can find the seralized node. Works with method
    // `getNodeFromInitialGraphToPromptSerializedWorkflowBecauseComfyUIBrokeStuff` to find a node
    // while serializing. What a way to work around...
    const graphSerialize = LGraph.prototype.serialize;
    LGraph.prototype.serialize = function () {
      const response = graphSerialize.apply(this, [...arguments] as any) as any;
      draekz.initialGraphToPromptSerializedWorkflowBecauseComfyUIBrokeStuff = response;
      return response;
    };

    // Overrides LiteGraphs' processMouseDown to both keep state as well as dispatch a custom event.
    const processMouseDown = LGraphCanvas.prototype.processMouseDown;
    LGraphCanvas.prototype.processMouseDown = function (e: PointerEvent) {
      draekz.processingMouseDown = true;
      const returnVal = processMouseDown.apply(this, [...arguments] as any);
      draekz.dispatchCustomEvent("on-process-mouse-down", {originalEvent: e});
      draekz.processingMouseDown = false;
      return returnVal;
    };

    // Overrides LiteGraph's `adjustMouseEvent` to capture the last even coming in and out. Useful
    // to capture the last `canvasX` and `canvasY` properties, which are not the same as LiteGraph's
    // `canvas.last_mouse_position`, unfortunately.
    const adjustMouseEvent = LGraphCanvas.prototype.adjustMouseEvent;
    LGraphCanvas.prototype.adjustMouseEvent = function <T extends MouseEvent>(
      e: T & Partial<CanvasPointerExtensions>,
    ): asserts e is T & CanvasMouseEvent {
      adjustMouseEvent.apply(this, [...arguments] as any);
      draekz.lastCanvasMouseEvent = e as CanvasMouseEvent;
    };

    // [🤮] Copying to clipboard clones nodes and then manipulats the linking data manually which
    // does not allow a node to handle connections. This harms nodes that manually handle inputs,
    // like our any-input nodes that may start with one input, and manually add new ones when one is
    // attached.
    const copyToClipboard = LGraphCanvas.prototype.copyToClipboard;
    LGraphCanvas.prototype.copyToClipboard = function (nodes: LGraphNode[]) {
      draekz.canvasCurrentlyCopyingToClipboard = true;
      draekz.canvasCurrentlyCopyingToClipboardWithMultipleNodes =
        Object.values(nodes || this.selected_nodes || []).length > 1;
      copyToClipboard.apply(this, [...arguments] as any);
      draekz.canvasCurrentlyCopyingToClipboard = false;
      draekz.canvasCurrentlyCopyingToClipboardWithMultipleNodes = false;
    };

    // [⭐] Make it so when we add a group, we get to name it immediately.
    const onGroupAdd = LGraphCanvas.onGroupAdd;
    LGraphCanvas.onGroupAdd = function (...args: any[]) {
      const graph = app.canvas.getCurrentGraph()!;
      onGroupAdd.apply(this, [...args] as any);
      // [🤮] Bad typing here.. especially the last arg; it is LGraphNode but can really be anything
      // with pos or size... pity. See more in our litegraph.d.ts.
      LGraphCanvas.onShowPropertyEditor(
        {} as any,
        null as any,
        null as any,
        null as any,
        graph._groups[graph._groups.length - 1]! as unknown as LGraphNode,
      );
    };
  }

  /**
   * [🤮] Handles the same exact thing as ComfyApp's `invokeExtensionsAsync`, but done here since
   * it is #private in ComfyApp because... of course it us. This is necessary since we purposefully
   * avoid using the ComfyNode due to historical instability and inflexibility for all the advanced
   * ui stuff comfyui-draekz-nodez nodes do, but we can still have other custom nodes know what's happening
   * with comfyui-draekz-nodez; specifically, for `nodeCreated` as of now.
   */
  async invokeExtensionsAsync(method: "nodeCreated", ...args: any[]) {
    const comfyapp = app as ComfyApp;
    if (CONFIG_SERVICE.getConfigValue("features.invoke_extensions_async.node_created") === false) {
      const [m, a] = this.logParts(
        LogLevel.INFO,
        `Skipping invokeExtensionsAsync for applicable comfyui-draekz-nodez nodes`,
      );
      console[m]?.(...a);
      return Promise.resolve();
    }
    return await Promise.all(
      comfyapp.extensions.map(async (ext) => {
        if (ext?.[method]) {
          try {
            const blocked = INVOKE_EXTENSIONS_BLOCKLIST.find((block) =>
              ext.name.toLowerCase().startsWith(block.name.toLowerCase()),
            );
            if (blocked) {
              const [n, v] = this.logger.logPartsOnceForTime(
                LogLevel.WARN,
                5000,
                `Blocked extension '${ext.name}' method '${method}' for draekz-nodez because: ${blocked.reason}`,
              );
              console[n]?.(...v);
              return Promise.resolve();
            }
            return await (ext[method] as Function)(...args, comfyapp);
          } catch (error) {
            const [n, v] = this.logParts(
              LogLevel.ERROR,
              `Error calling extension '${ext.name}' method '${method}' for draekz-node.`,
              {error},
              {extension: ext},
              {args},
            );
            console[n]?.(...v);
          }
        }
      }),
    );
  }

  /**
   * Wraps `dispatchEvent` for easier CustomEvent dispatching.
   */
  private dispatchCustomEvent(event: string, detail?: any) {
    if (detail != null) {
      return this.dispatchEvent(new CustomEvent(event, {detail}));
    }
    return this.dispatchEvent(new CustomEvent(event));
  }

  /**
   * Initializes hooks specific to an comfyui-draekz-nodez context menu on the root menu.
   */
  private async initializeContextMenu() {
    const that = this;
    setTimeout(async () => {
      const getCanvasMenuOptions = LGraphCanvas.prototype.getCanvasMenuOptions;
      LGraphCanvas.prototype.getCanvasMenuOptions = function (...args: any[]) {
        let existingOptions = getCanvasMenuOptions.apply(this, [...args] as any);

        const options: (IContextMenuValue | null)[] = [];
        options.push(null); // Divider
        options.push(null); // Divider
        options.push(null); // Divider
        options.push({
          content: logoDraekz + `comfyui-draekz-nodez`,
          className: "draekz-contextmenu-item draekz-contextmenu-main-item-comfyui-draekz-nodez",
          submenu: {
            options: that.getDraekzIContextMenuValues(),
          },
        });
        options.push(null); // Divider
        options.push(null); // Divider

        let idx = null;
        idx = idx || existingOptions.findIndex((o) => o?.content?.startsWith?.("Queue Group")) + 1;
        idx =
          idx || existingOptions.findIndex((o) => o?.content?.startsWith?.("Queue Selected")) + 1;
        idx = idx || existingOptions.findIndex((o) => o?.content?.startsWith?.("Convert to Group"));
        idx = idx || existingOptions.findIndex((o) => o?.content?.startsWith?.("Arrange ("));
        idx = idx || existingOptions.findIndex((o) => !o) + 1;
        idx = idx || 3;
        // [🤮] existingOptions is typed as IContextMenuValue<string> even though it need not be
        // a string due to the crazy typing from the original litegraph. oh well.
        (existingOptions as (IContextMenuValue | null)[]).splice(idx, 0, ...options);
        for (let i = existingOptions.length; i > 0; i--) {
          if (existingOptions[i] === null && existingOptions[i + 1] === null) {
            existingOptions.splice(i, 1);
          }
        }

        return existingOptions;
      };
    }, 1016);
  }

  /**
   * Returns the standard menu items for an comfyui-draekz-nodez context menu.
   */
  private getDraekzIContextMenuValues(): IContextMenuValue[] {
    const [canvas, graph] = [app.canvas as TLGraphCanvas, app.canvas.getCurrentGraph()!];
    const selectedNodes = Object.values(canvas.selected_nodes || {});
    let rerouteNodes: LGraphNode[] = [];
    if (selectedNodes.length) {
      rerouteNodes = selectedNodes.filter((n) => n.type === "Reroute");
    } else {
      rerouteNodes = graph._nodes.filter((n) => n.type == "Reroute");
    }
    const rerouteLabel = selectedNodes.length ? "selected" : "all";

    const showBookmarks = CONFIG_SERVICE.getFeatureValue("menu_bookmarks.enabled");
    const bookmarkMenuItems = showBookmarks ? getBookmarks() : [];

    return [
      {
        content: "Nodes",
        disabled: true,
        className: "draekz-contextmenu-item draekz-contextmenu-label",
      },
      {
        content: iconNode + "All",
        className: "draekz-contextmenu-item",
        has_submenu: true,
        submenu: {
          options: getNodeTypeStrings() as unknown as IContextMenuValue[],
          callback: (
            value: string | IContextMenuValue,
            options: IContextMenuOptions,
            event: MouseEvent,
          ) => {
            const node = LiteGraph.createNode(addDraekz(value as string));
            if (node) {
              node.pos = [
                draekz.lastCanvasMouseEvent!.canvasX,
                draekz.lastCanvasMouseEvent!.canvasY,
              ];
              canvas.graph!.add(node);
              canvas.selectNode(node);
              graph.setDirtyCanvas(true, true);
            }
          },
          extra: {draekz_doNotNest: true},
        },
      },

      {
        content: "Actions",
        disabled: true,
        className: "draekz-contextmenu-item draekz-contextmenu-label",
      },
      {
        content: iconGear + "Settings (comfyui-draekz-nodez)",
        disabled: !!this.settingsDialog,
        className: "draekz-contextmenu-item",
        callback: (...args: any[]) => {
          this.settingsDialog = new DraekzConfigDialog().show();
          this.settingsDialog.addEventListener("close", (e) => {
            this.settingsDialog = null;
          });
        },
      },
      {
        content: iconReplace + ` Convert ${rerouteLabel} Reroutes`,
        disabled: !rerouteNodes.length,
        className: "draekz-contextmenu-item",
        callback: (...args: any[]) => {
          const msg =
            `Convert ${rerouteLabel} ComfyUI Reroutes to Reroute (draekz) nodes? \n` +
            `(First save a copy of your workflow & check reroute connections afterwards)`;
          if (!window.confirm(msg)) {
            return;
          }
          (async () => {
            for (const node of [...rerouteNodes]) {
              if (node.type == "Reroute") {
                this.replacingReroute = node.id;
                await replaceNode(node, NodeTypesString.REROUTE);
                this.replacingReroute = null;
              }
            }
          })();
        },
      },
      ...bookmarkMenuItems,
      {
        content: "More...",
        disabled: true,
        className: "draekz-contextmenu-item draekz-contextmenu-label",
      },
      {
        content: iconStarFilled + "Star on Github",
        className: "draekz-contextmenu-item draekz-contextmenu-github",
        callback: (...args: any[]) => {
          window.open("https://github.com/draekz/comfyui-draekz-nodez", "_blank");
        },
      },
    ];
  }

  /**
   * Wraps an `app.queuePrompt` call setting a specific node id that we will inspect and change the
   * serialized graph right before being sent (below, in our `api.queuePrompt` override).
   */
  async queueOutputNodes(nodeIds: NodeId[]) {
    try {
      this.queueNodeIds = nodeIds;
      await app.queuePrompt(0);
    } catch (e) {
      const [n, v] = this.logParts(
        LogLevel.ERROR,
        `There was an error queuing nodes ${nodeIds}`,
        e,
      );
      console[n]?.(...v);
    } finally {
      this.queueNodeIds = null;
    }
  }

  /**
   * Recusively walks backwards from a node adding its inputs to the `newOutput` from `oldOutput`.
   */
  private recursiveAddNodes(nodeId: string, oldOutput: ComfyApiFormat, newOutput: ComfyApiFormat) {
    let currentId = nodeId;
    let currentNode = oldOutput[currentId]!;
    if (newOutput[currentId] == null) {
      newOutput[currentId] = currentNode;
      for (const inputValue of Object.values(currentNode.inputs || [])) {
        if (Array.isArray(inputValue)) {
          this.recursiveAddNodes(inputValue[0], oldOutput, newOutput);
        }
      }
    }
    return newOutput;
  }

  /**
   * Initialize a bunch of hooks into ComfyUI and/or LiteGraph itself so we can either keep state or
   * context on what's happening so nodes can respond appropriately. This is usually to fix broken
   * assumptions in the unowned code [🤮], but sometimes to add features or enhancements too [⭐].
   */
  private initializeComfyUIHooks() {
    const draekz = this;

    // Keep state for when the app is queuing the prompt. For instance, this is used for seed to
    // understand if we're serializing because we're queueing (and return the random seed to use) or
    // for saving the workflow (and keep -1, etc.).
    const queuePrompt = app.queuePrompt as Function;
    app.queuePrompt = async function (number: number, batchCount?: number) {
      draekz.processingQueue = true;
      draekz.dispatchCustomEvent("queue");
      try {
        return await queuePrompt.apply(app, [...arguments]);
      } finally {
        draekz.processingQueue = false;
        draekz.dispatchCustomEvent("queue-end");
      }
    };

    // Keep state for when the app is in the middle of loading from an api JSON file.
    const loadApiJson = app.loadApiJson;
    app.loadApiJson = async function(apiData: any, fileName: string) {
      draekz.loadingApiJson = apiData as ComfyApiFormat;
      try {
        loadApiJson.apply(app, [...arguments] as any);
      } finally {
        draekz.loadingApiJson = null;
      }
    };

    // Keep state for when the app is serizalizing the graph to prompt.
    const graphToPrompt = app.graphToPrompt;
    app.graphToPrompt = async function () {
      draekz.dispatchCustomEvent("graph-to-prompt");
      let promise = graphToPrompt.apply(app, [...arguments] as any);
      await promise;
      draekz.dispatchCustomEvent("graph-to-prompt-end");
      return promise;
    };

    // Override the queuePrompt for api to intercept the prompt output and, if queueNodeIds is set,
    // then we only want to queue those nodes, by rewriting the api format (prompt 'output' field)
    // so only those are evaluated.
    const apiQueuePrompt = api.queuePrompt as Function;
    api.queuePrompt = async function (index: number, prompt: ComfyApiPrompt) {
      if (draekz.queueNodeIds?.length && prompt.output) {
        const oldOutput = prompt.output;
        let newOutput = {};
        for (const queueNodeId of draekz.queueNodeIds) {
          draekz.recursiveAddNodes(String(queueNodeId), oldOutput, newOutput);
        }
        prompt.output = newOutput;
      }
      draekz.dispatchCustomEvent("comfy-api-queue-prompt-before", {
        workflow: prompt.workflow,
        output: prompt.output,
      });
      const response = apiQueuePrompt.apply(app, [index, prompt]);
      draekz.dispatchCustomEvent("comfy-api-queue-prompt-end");
      return response;
    };

    // Hook into a clean call; allow us to clear and draekz messages.
    const clean = app.clean;
    app.clean = function () {
      draekz.clearAllMessages();
      clean && clean.apply(app, [...arguments] as any);
    };

    // Hook into a data load, like from an image or JSON drop-in. This is (currently) used to
    // monitor for bad linking data.
    const loadGraphData = app.loadGraphData;
    // NOTE: This was "serializedLGraph" in pre-litegraph types, which maps to `ISerialisedGraph`
    // now; though, @comfyorg/comfyui-frontend-types have the signature as `ComfyWorkflowJSON` which
    // is not exported and a zod type. Looks like there's mostly an overlap with ISerialisedGraph.
    app.loadGraphData = function (graph: ISerialisedGraph) {
      if (draekz.monitorLinkTimeout) {
        clearTimeout(draekz.monitorLinkTimeout);
        draekz.monitorLinkTimeout = null;
      }
      draekz.clearAllMessages();
      // Try to make a copy to use, because ComfyUI's loadGraphData will modify it.
      let graphCopy: ISerialisedGraph | null;
      try {
        graphCopy = JSON.parse(JSON.stringify(graph));
      } catch (e) {
        graphCopy = null;
      }
      setTimeout(() => {
        const wasLoadingAborted = document
          .querySelector(".comfy-modal-content")
          ?.textContent?.includes("Loading aborted due");
        const graphToUse = wasLoadingAborted ? graphCopy || graph : app.graph;
        const fixer = WorkflowLinkFixer.create(graphToUse as unknown as TLGraph);
        const fixBadLinksResult = fixer.check();
        if (fixBadLinksResult.hasBadLinks) {
          const [n, v] = draekz.logParts(
            LogLevel.WARN,
            `The workflow you've loaded has corrupt linking data. Open ${
              new URL(location.href).origin
            }/draekz/link_fixer to try to fix.`,
          );
          console[n]?.(...v);
          if (CONFIG_SERVICE.getConfigValue("features.show_alerts_for_corrupt_workflows")) {
            draekz.showMessage({
              id: "bad-links",
              type: "warn",
              message:
                "The workflow you've loaded has corrupt linking data that may be able to be fixed.",
              actions: [
                {
                  label: "Open fixer",
                  href: "/draekz/link_fixer",
                },
                {
                  label: "Fix in place",
                  href: "/draekz/link_fixer",
                  callback: (event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    if (
                      confirm(
                        "This will attempt to fix in place. Please make sure to have a saved copy of your workflow.",
                      )
                    ) {
                      try {
                        const fixBadLinksResult = fixer.fix();
                        if (!fixBadLinksResult.hasBadLinks) {
                          draekz.hideMessage("bad-links");
                          alert(
                            "Success! It's possible some valid links may have been affected. Please check and verify your workflow.",
                          );
                          wasLoadingAborted && app.loadGraphData(fixBadLinksResult.graph);
                          if (
                            CONFIG_SERVICE.getConfigValue("features.monitor_for_corrupt_links") ||
                            CONFIG_SERVICE.getConfigValue("features.monitor_bad_links")
                          ) {
                            draekz.monitorLinkTimeout = setTimeout(() => {
                              draekz.monitorBadLinks();
                            }, 5000);
                          }
                        }
                      } catch (e) {
                        console.error(e);
                        alert("Unsuccessful at fixing corrupt data. :(");
                        draekz.hideMessage("bad-links");
                      }
                    }
                  },
                },
              ],
            });
          }
        } else if (
          CONFIG_SERVICE.getConfigValue("features.monitor_for_corrupt_links") ||
          CONFIG_SERVICE.getConfigValue("features.monitor_bad_links")
        ) {
          draekz.monitorLinkTimeout = setTimeout(() => {
            draekz.monitorBadLinks();
          }, 5000);
        }
      }, 100);
      return loadGraphData && loadGraphData.apply(app, [...arguments] as any);
    };
  }

  /**
   * [🤮] Finds a node in the currently serializing workflow from the hook setup above. This is to
   * mitigate breakages from https://github.com/comfyanonymous/ComfyUI/issues/2193 we can try to
   * store the workflow node so our nodes can find the seralized node.
   */
  getNodeFromInitialGraphToPromptSerializedWorkflowBecauseComfyUIBrokeStuff(
    node: LGraphNode,
  ): ISerialisedNode | null {
    return (
      this.initialGraphToPromptSerializedWorkflowBecauseComfyUIBrokeStuff?.nodes?.find(
        (n: ISerialisedNode) => n.id === node.id,
      ) ?? null
    );
  }

  /**
   * Shows a message in the UI.
   */
  async showMessage(data: DraekzUiMessage) {
    let container = document.querySelector(".draekz-top-messages-container");
    if (!container) {
      container = document.createElement("div");
      container.classList.add("draekz-top-messages-container");
      document.body.appendChild(container);
    }
    // If we have a dialog open then we want to append the message to the dialog so they show over
    // the modal.
    const dialogs = queryAll<HTMLDialogElement>("dialog[open]");
    if (dialogs.length) {
      let dialog = dialogs[dialogs.length - 1]!;
      dialog.appendChild(container);
      dialog.addEventListener("close", (e) => {
        document.body.appendChild(container!);
      });
    }
    // Hide if we exist.
    await this.hideMessage(data.id);

    const messageContainer = document.createElement("div");
    messageContainer.setAttribute("type", data.type || "info");

    const message = document.createElement("span");
    message.innerHTML = data.message;
    messageContainer.appendChild(message);

    for (let a = 0; a < (data.actions || []).length; a++) {
      const action = data.actions![a]!;
      if (a > 0) {
        const sep = document.createElement("span");
        sep.innerHTML = "&nbsp;|&nbsp;";
        messageContainer.appendChild(sep);
      }

      const actionEl = document.createElement("a");
      actionEl.innerText = action.label;
      if (action.href) {
        actionEl.target = "_blank";
        actionEl.href = action.href;
      }
      if (action.callback) {
        actionEl.onclick = (e) => {
          return action.callback!(e);
        };
      }
      messageContainer.appendChild(actionEl);
    }

    const messageAnimContainer = document.createElement("div");
    messageAnimContainer.setAttribute("msg-id", data.id);
    messageAnimContainer.appendChild(messageContainer);
    container.appendChild(messageAnimContainer);

    // Add. Wait. Measure. Wait. Anim.
    await wait(64);
    messageAnimContainer.style.marginTop = `-${messageAnimContainer.offsetHeight}px`;
    await wait(64);
    messageAnimContainer.classList.add("-show");

    if (data.timeout) {
      await wait(data.timeout);
      this.hideMessage(data.id);
    }
  }

  /**
   * Hides a message in the UI.
   */
  async hideMessage(id: string) {
    const msg = document.querySelector(`.draekz-top-messages-container > [msg-id="${id}"]`);
    if (msg?.classList.contains("-show")) {
      msg.classList.remove("-show");
      await wait(750);
    }
    msg && msg.remove();
  }

  /**
   * Clears all messages in the UI.
   */
  async clearAllMessages() {
    let container = document.querySelector(".draekz-top-messages-container");
    container && (container.innerHTML = "");
  }

  setLogLevel(level?: LogLevel | string) {
    if (typeof level === "string") {
      level = LogLevelKeyToLogLevel[CONFIG_SERVICE.getConfigValue("log_level")];
    }
    if (level != null) {
      GLOBAL_LOG_LEVEL = level;
    }
  }

  logParts(level: LogLevel, message?: string, ...args: any[]) {
    return this.logger.logParts(level, message, ...args);
  }

  newLogSession(name?: string) {
    return this.logger.newSession(name);
  }

  isDebugMode() {
    if (window.location.href.includes("draekz-debug=false")) {
      return false;
    }
    return GLOBAL_LOG_LEVEL >= LogLevel.DEBUG || window.location.href.includes("draekz-debug");
  }

  isDevMode() {
    if (window.location.href.includes("draekz-dev=false")) {
      return false;
    }
    return GLOBAL_LOG_LEVEL >= LogLevel.DEV || window.location.href.includes("draekz-dev");
  }

  monitorBadLinks() {
    const badLinksFound = WorkflowLinkFixer.create(app.graph).check();
    if (badLinksFound.hasBadLinks && !this.monitorBadLinksAlerted) {
      this.monitorBadLinksAlerted = true;
      alert(
        `Problematic links just found in live data. Can you save your workflow and file a bug with ` +
          `the last few steps you took to trigger this at ` +
          `https://github.com/draekz/comfyui-draekz-nodez/issues. Thank you!`,
      );
    } else if (!badLinksFound.hasBadLinks) {
      // Clear the alert once fixed so we can alert again.
      this.monitorBadLinksAlerted = false;
    }
    this.monitorLinkTimeout = setTimeout(() => {
      this.monitorBadLinks();
    }, 5000);
  }
}

function getBookmarks(): IContextMenuValue[] {
  const bookmarks = BOOKMARKS_SERVICE.getCurrentBookmarks();
  const bookmarkItems = bookmarks.map((n) => ({
    content: `[${n.shortcutKey}] ${n.title}`,
    className: "draekz-contextmenu-item",
    callback: () => {
      n.canvasToBookmark();
    },
  }));

  return !bookmarkItems.length
    ? []
    : [
        {
          content: "🔖 Bookmarks",
          disabled: true,
          className: "draekz-contextmenu-item draekz-contextmenu-label",
        },
        ...bookmarkItems,
      ];
}

export const draekz = new Draekz();
// Expose it on window because, why not.
(window as any).draekz = draekz;

app.registerExtension({
  name: "Comfy.DraekzNodez",

  aboutPageBadges: [
    {
      label: `comfyui-draekz-nodez v${draekz.version}`,
      url: "https://github.com/draekz/comfyui-draekz-nodez",
      icon: "comfyui-draekz-nodez-about-badge-logo",
    },
  ],
});
