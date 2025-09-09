/**
 * Typings specific to comfyui-draekz-nodez.
 */
import type { LGraphNode, Vector2 } from "@comfyorg/frontend";
import type { CanvasMouseEvent } from "@comfyorg/litegraph/dist/types/events.js";
import type { DraekzBaseNode, DraekzBaseVirtualNode } from '../comfyui/base_node.js'

export type AdjustedMouseCustomEvent = CustomEvent<{ originalEvent: CanvasMouseEvent }>;

export type Constructor<T> = new(...args: any[]) => T;

export interface DraekzBaseNodeConstructor extends Constructor<DraekzBaseNode> {
	static type: string;
	static category: string;
  static comfyClass: string;
	static exposedActions: string[];
}

export interface DraekzBaseVirtualNodeConstructor extends Constructor<DraekzBaseVirtualNode> {
	static type: string;
	static category: string;
	static _category: string;
}

export interface DraekzBaseServerNodeConstructor extends Constructor<DraekzBaseServerNode> {
	static nodeType: ComfyNodeConstructor;
	static nodeData: ComfyObjectInfo;
	static __registeredForOverride__: boolean;
  onRegisteredForOverride(comfyClass: any, draekzClass: any) : void;
}

export type DraekzModelInfoDetails = {
  file?: string;
  path?: string;
  hasInfoFile?: boolean;
  image?: string;
}

export type DraekzModelInfo = DraekzModelInfoDetails & {
  name?: string;
  type?: string;
  baseModel?: string;
  baseModelFile?: string;
  links?: string[];
  strengthMin?: number;
  strengthMax?: number;
  triggerWords?: string[];
  trainedWords?: {
    word: string;
    count?: number;
    civitai?: boolean
    user?: boolean
  }[];
  description?: string;
  sha256?: string;
  path?: string;
  images?: {
    url: string;
    civitaiUrl?: string;
    steps?: string|number;
    cfg?: string|number;
    type?: 'image'|'video';
    sampler?: string;
    model?: string;
    seed?: string;
    negative?: string;
    positive?: string;
    resources?: {name?: string, type?: string, weight?: string|number}[];
  }[]
  userTags?: string[];
  userNote?: string;
  raw?: any;
  // This one is just on the client.
  filterDir?: string;
}
