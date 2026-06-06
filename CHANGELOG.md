# Changelog

## 0.1.2

- Added seeking. You can now click on the progress bar to jump to a specific playback position
- Added a button to enlarge the cover by opening the largest available version in a new tab
- Added a button to mute audio of individual tabs. Note that this mutes the entire tab and does not use any mute controls that may be present on the website, like e.g. on YouTube. The website can only be unmuted again using the browser's controls or via the extension menu
- Artist and album links now open the respective artist or album page directly within the tab in which the media is playing instead of in a new tab. The tab is also focused when such a link is clicked. The link to the artist or album page can still be copied by right-clicking it
- Spotify and Deezer now have media controls, just like other streaming services
- Improved integration with websites and reliability by preferring to execute MediaSession action handlers that are registered by the page instead of interacting with HTML elements on the web page whenever possible
- The extension now detects media in iframes (e.g. YouTube embeds) and allows controlling each frame individually
- The track title is now wrapped in a link element to the track or album page. Likewise, the site's domain is now also wrapped in a link element to the website. Clicking either link focuses the tab. Each link can be copied via the browser's right-click menu. Removed the share button for now, as the link can be copied from the title instead. An improved and more intuitive share button will be added in a future version
- Clicking anywhere in the area around the metadata now focuses the tab the media is playing in
- Now extracting page links for the track page on Apple Music, for the track, artist and album page on Classical Apple Music, for the track and artist page on SoundCloud, for the channel on YouTube via channel handles that start with "@" and for the channel in embedded YouTube videos
- Improved responsiveness and reduced flickering of the extension pop-up
- Increased the area of playback control buttons to make them easier to click
- The track title is now semibold to emphasize it more
- Fixed some artists links not being extracted from the web page
- Fixed some album links being only partially underlined at times
- Fixed the website icon (favicon) not showing for some websites (e.g. TIDAL). Also, when no icon is present, the extension now falls back to showing a globe icon instead of no icon
- Fixed some links that contained whitespace not being extracted properly
- Fixed Spotify Canvas interfering with active music playback
- Fixed Discord notification sounds showing up in the extension pop-up sometimes

## 0.1.1

- Now shows all media from tabs, the media does not have to be audible anymore
- Now extracting page links on YouTube, Bandcamp, Apple Music and SoundCloud
- Added a togglable information banner that the extension is still in development with a link to report issues
- Added the "webNavigation" permission to detect page navigation and hide outdated media more reliably
- Added the "storage" permission to persistently store the information banner toggle state

## 0.1.0

- Initial release
- **TODO** Describe this more
