# Media Control

This browser extension displays media from all your open tabs
and allows you to control it.

It comes with rich metadata support,
including song details from music streaming services,
links to the song, artist and album pages.
All completely offline &ndash; the data is extracted from the browser tab
by analyzing the web page, no requests to external APIs are made.
You can also control media playback in most cases, if the website supports it,
by pausing and resuming it, skipping to the next song
or rewinding to the beginning.

You can also create a pop-out window to continuously observe media.

> [!NOTE]
> The extension is still in development. A first release will follow soon.

## Screenshots

### Firefox

![](./.github/assets/screenshot-firefox.png)

### Chrome

![](./.github/assets/screenshot-chrome.png)

### Pop-out window

![](./.github/assets/screenshot-poput-window.png)

## Development

```sh
$ git clone https://github.com/ungive/media-control-extension
$ cd media-control-extension
$ pnpm install
$ pnpm dev:firefox
$ pnpn dev  # Chrome
```

## Copyright

Copyright (c) 2025-2026 Jonas van den Berg  
This code is source-available only at this time, until it is published.  
All rights reserved.
