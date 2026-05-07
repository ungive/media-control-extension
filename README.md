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

### Quick start

```sh
$ git clone https://github.com/ungive/media-control-extension
$ cd media-control-extension
$ pnpm install
$ pnpm dev:firefox
$ pnpn dev  # Chrome
```

### Developing inside a Docker container

These steps are for [VSCodium](https://vscodium.com/) with the [Open Remote - SSH](https://open-vsx.org/vscode/item?itemName=jeanp413.open-remote-ssh) extension on Linux:

```sh
$ git clone https://github.com/ungive/media-control-extension
$ cd media-control-extension
$ bash ./dev-container.sh --start
# Inside the container:
% pnpm install
% pnpm wxt --host 0.0.0.0 -b firefox  # Firefox
% pnpm wxt --host 0.0.0.0 -b chrome  # Chrome
```

The first command creates and starts (or restarts) a dev container and opens VSCodium. After installing dependencies and starting WXT, open your host's browser and load the extension from the `.output` directory. If your browser is installed via Flatpak, you need to give the browser read/write permission to the `.output` directory. The extension should now auto-reload and you have a fully working development environment.

If you want to make commits inside the container (run this outside the container):

```sh
$ git config --local user.name "$(git config --global --get user.name)"
$ git config --local user.email "$(git config --global --get user.email)"
```

You'll have to push changes outside the container.

To erase the container:

```sh
$ bash ./dev-container.sh --erase
```

## Copyright

Copyright (c) 2025-2026 Jonas van den Berg  
This code is source-available only at this time, until it is published.  
All rights reserved.
