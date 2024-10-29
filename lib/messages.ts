import { BrowserMedia } from "./proto";

export enum ExtensionMessage {
  SendMediaUpdates,
  CancelMediaUpdates
}

export enum TabMessage {
  MediaChanged
}

export interface MediaChangedPayload {
  state: BrowserMedia.MediaState
}
