
export enum ExtensionMessage {
  SendMediaUpdates = 1,
  CancelMediaUpdates,
  CurrentMedia
}

export enum TabMessage {
  MediaChanged = 100
}

export enum PopupMessage {
  GetCurrentMedia = 200,
  PauseMedia,
  PlayMedia,
  SeekStart,
  NextTrack
}

export interface RuntimeMessage {
  type: ExtensionMessage | TabMessage | PopupMessage
  payload: any
}

export interface MediaChangedPayload {
  stateJson: object
  hasControls: boolean
}

export interface CurrentMediaElementPayload {
  tabId: number
  stateJson: object
  hasControls: boolean
}

export interface CurrentMediaPayload {
  media: CurrentMediaElementPayload[]
}
