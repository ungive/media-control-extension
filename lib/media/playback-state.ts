/**
 * Represents the playback position of some media, either playing or paused.
 */
export class PlaybackState {
  private _position: number
  private _positionTimestamp: number
  private _duration: number | null;
  private _playing: boolean;

  /**
   * Constructs a new {@link PlaybackState} with the given parameters.
   *
   * @param position Playback position in milliseconds.
   * @param duration Playback duration in milliseconds.
   * @param playing Whether the media is playing or not.
   * @param positionTimestamp The timestamp for the given playback position.
   */
  constructor(position: number, duration: number | null,
              playing: boolean, positionTimestamp = Date.now()) {
    if (positionTimestamp < 0) {
      throw Error('timestamp may not be negative');
    }
    if (duration && duration <= 0) {
      throw Error('duration may not be zero or negative');
    }
    this._position = position;
    this._positionTimestamp = positionTimestamp;
    this._duration = duration;
    this._playing = playing;
  }

  /**
   * Constructs a {@link PlaybackState} from another playback state.
   * 
   * @param other The other playback state.
   * @returns A new {@link PlaybackState} instance.
   */
  static from(other: PlaybackState): PlaybackState {
    return new PlaybackState(
      other.position, other.duration, other.playing, other.positionTimestamp);
  }

  /**
   * Returns the playback position as it was at the given point in time.
   * If the point lies too far in the past the method will return 0,
   * if it is beyond the duration it will return the duration.
   * 
   * @param when The point in time given as an epoch timestamp in milliseconds.
   * @returns The playback position at the given point in time.
   */
  livePosition(when = Date.now()): number {
    if (when < 0) {
      throw Error('timestamp may not be negative');
    }
    if (!this._playing) {
      return this._position;
    }
    const timeDelta = when - this._positionTimestamp;
    let thenPosition = Math.max(0, this._position + timeDelta);
    if (this._duration) {
      thenPosition = Math.min(this._duration, thenPosition);
    }
    return thenPosition;
  }

  /**
   * Checks whether the two playback positions are identical,
   * within the bounds of a given epsilon.
   * 
   * @param epsilon The allowed error in milliseconds.
   * @returns Whether the two playback positions are considered equal.
   */
  equals(other: PlaybackState, epsilon: number): boolean {
    return this.playing === other.playing
      && this.duration === other.duration
      && Math.abs(this.livePosition() - other.livePosition()) < epsilon;
  }

  get position(): number { return this._position; }
  get positionTimestamp(): number { return this._positionTimestamp; }
  get duration(): number | null { return this._duration; }
  get playing(): boolean { return this._playing; }
}
