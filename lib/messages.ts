
export enum ExtensionMessage {
  CurrentMedia = 0,
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
  SeekPosition,
  NextTrack,
  OpenPopout,
  GetPopoutState,
  OpenLink,
}

export enum PopoutMessage {
  WindowSize = 300,
}

export type RuntimeMessageType = ExtensionMessage | TabMessage | PopupMessage | PopoutMessage

export interface RuntimeMessage {
  type: RuntimeMessageType
  payload?: any
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

export interface TabMediaSource {
  tabId: number
  frameId: number
}

export interface CurrentMediaElementPayload {
  source: TabMediaSource
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
  text: string
  href: string | undefined
}

export interface SeekPositionPayload {
  position: number
}

export enum MediaSessionMessage {
  ActionPlay = 0,
  ActionPause,
  ActionSeekTo,
  ActionPreviousTrack,
  ActionNextTrack,
}

export type WindowMessageType = MediaSessionMessage

export interface WindowMessage {
  id: string
  type: WindowMessageType
  payload?: any
}

export interface WindowResponseMessage {
  messageId: string
  ok: boolean
  payload?: any
}

export interface ActionSeekToPayload {
  position: number
}
