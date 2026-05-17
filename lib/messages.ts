
export enum ExtensionMessage {
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
  OpenLink,
}

export enum PopoutMessage {
  WindowSize = 300,
}

export interface RuntimeMessage {
  type: ExtensionMessage | TabMessage | PopupMessage | PopoutMessage
  payload: any
}

export interface MediaControlCapabilities {
  playPause: boolean
  seekStart: boolean
  skip: boolean
}

export interface MediaChangedPayload {
  stateJson: object | null
  controls: MediaControlCapabilities
  metadataButtons: Set<string>
}

export interface CurrentMediaElementPayload {
  tabId: number
  stateJson: object
  controls: MediaControlCapabilities
  metadataButtons: Set<string>
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

export interface OpenLinkPayload {
  text: string,
  href: string | undefined,
}
