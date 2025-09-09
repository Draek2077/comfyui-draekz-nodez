/**
 * This used to augment the LiteGraph types, either to fix them for how they actually behave
 * (e.g. marking args that are typed as required as optional because they actually are, etc.) or
 * adding properties/methods that comfyui-draekz-nodez adds/uses. Mostly the latter are prefixed 'draekz_'
 * but not always.
 */
import "@comfyorg/frontend";

declare module "@comfyorg/frontend" {
  interface INodeSlot {
    // @draekz: Hides a slot for comfyui-draekz-nodez draw methods.
    hidden?: boolean;

    // @draekz: Used to "disable" an input/output. Used in PowerPrompt to disallow connecting
    // an output if there's no optional corresponding input (since, that would just break).
    disabled?: boolean;

    // @draekz: A status we put on some nodes so we can draw things around it.
    draekz_status?: "WARN" | "ERROR";
  }

  interface LGraph {
    // @draekz (Fix): `result` arg is optional in impl.
    findNodesByType(type: string, result?: LGraphNode[]): LGraphNode[];
  }

  interface LGraphNode {
    // @draekz: comfyui-draekz-nodez added this before comfyui did and it was a bit more flexible.
    removeWidget(widget: IBaseWidget|IWidget|number|undefined): void;

    // @draekz (Fix): Implementation allows a falsy value to be returned and it will suppress the
    // menu all together.
    // NOTE: [🤮] We can't actually augment this because it's a return.. but keeping here because
    // this is how it's actually implemented.
    // getSlotMenuOptions?(this: LGraphNode, slot: IFoundSlot): IContextMenuValue[] | void;

    // @draekz (Fix): Implementation allows a falsy value to be returned and it will not add items.
    // NOTE: [🤮] We can't actually augment this because it's a return.. but keeping here because
    // this is how it's actually implemented.
    // getExtraMenuOptions?(
    //   canvas: LGraphCanvas,
    //   options: (IContextMenuValue<unknown> | null)[],
    // ): (IContextMenuValue<unknown> | null)[] | void;
  }

  interface LGraphGroup {
    // @draekz: Track whether a group has any active node from the fast group mode changers.
    draekz_hasAnyActiveNode?: boolean;
  }

  interface LGraphCanvas {
    // @draekz (Fix): At one point this was in ComfyUI's app.js. I don't see it now... perhaps it's
    // been removed? We were using it in comfyui-draekz-nodez.
    selected_group_moving?: boolean;

    // @draekz (Fix): Allows LGraphGroup to be passed (it could be `{size: Point, pos: Point}`).
    centerOnNode(node: LGraphNode | LGraphGroup);

    // @draekz (Fix): Makes item's fields optiona, and other params nullable, as well as adds
    // LGraphGroup to the node, since the implementation accomodates all of these as typed below.
    // NOTE: [🤮] We can't actually augment this because it's static.. but keeping here because
    // this is how it's actually implemented.
    // static onShowPropertyEditor(
    //   item: {
    //     property?: keyof LGraphNode | undefined;
    //     type?: string;
    //   },
    //   options: IContextMenuOptions<string> | null,
    //   e: MouseEvent | null,
    //   menu: ContextMenu<string> | null,
    //   node: LGraphNode | LGraphGroup,
    // ): void;
  }

  interface LGraphNodeConstructor {
    // @draekz (Fix): Fixes ComfyUI-Frontend which marks this as required, even through even though
    // elsewhere it defines it as optional (like for the actual for LGraphNode).
    comfyClass?: string;

    // @draekz: reference the original nodeType data as sometimes extensions clobber it.
    nodeType?: LGraphNodeConstructor | null;
  }
}

declare module "@/lib/litegraph/src/types/widgets" {
  interface IBaseWidget {
    // @draekz (Fix): Where is this in Comfy types?
    inputEl?: HTMLInputElement;

    // @draekz: A status we put on some nodes so we can draw things around it.
    draekz_lastValue?: any;
  }
}

declare module "@/lib/litegraph/src/interfaces" {
  // @draekz (Fix): widget is (or was?) available when inputs were moved from a widget.
  interface IFoundSlot {
    widget?: IBaseWidget;
  }
}

declare module "@comfyorg/litegraph/dist/LiteGraphGlobal" {
  interface LiteGraphGlobal {
    // @draekz (Fix): Window is actually optional in the code.
    closeAllContextMenus(ref_window?: Window): void;
  }
}
