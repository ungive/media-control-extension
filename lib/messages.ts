
export enum ExtensionMessage {
  SendMediaUpdates = 1,
  CancelMediaUpdates,
  CurrentMedia,
  PopoutOpened,
  PopoutClosed,
  PopoutState,
}

export enum TabMessage {
  MediaChanged = 100,
}

export enum PopupMessage {
  GetCurrentMedia = 200,
  PauseMedia,
  PlayMedia,
  SeekStart,
  NextTrack,
  OpenPopout,
  GetPopoutState,
}

export enum PopoutMessage {
  WindowSize = 300,
}

export interface RuntimeMessage {
  type: ExtensionMessage | TabMessage | PopupMessage | PopoutMessage
  payload: any
}

export interface MediaChangedPayload {
  stateJson: object | null
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

export interface WindowSizePayload {
  width: number
  height: number
}

export interface PopoutStatePaylaod {
  result: boolean
}
