# 1.1.1
  - fixed sorting algorithm causing changes to account data

# 1.1.0
  - added support for shared secrets ([#5](https://github.com/dumbasPL/csgo-checker/issues/5))
  - added new cooldown reason `Reports (Grief)`
  - added encryption (can be enabled in settings)
  - search and sorting now updates correctly when account data changes ([#6](https://github.com/dumbasPL/csgo-checker/issues/6))
  - fixed tooltips not disappearing after deleting account without confirmation

# 1.0.2
 - fixed tags not being saved when adding new account
 - fixed some action buttons not working on newly added accounts
 - fixed accounts not automatically refreshing after being added

# 1.0.1
 - fixed overwatch bans showing remaining time
 - updated checker logic to latest game update

# 1.0.0

**⚠️ Data storage format changed, please refresh all accounts for ranks to display correctly ⚠️**

 - ui overhaul
 - migrated ui from materializecss to bootstrap
 - added changelog
 - added dangerzone ranks
 - added rank icons
 - added rank expiration time
 - added search bar
 - added ability to sort accounts by `login`, `name`, `lvl`, `prime starts`, `rank`, `ban status`
 - added option to export all accounts as `user:pass` combo list
 - added tags
 - added option to edit accounts
 - added settings
 - added `delete all accounts` button in settings
 - updated icon to match the new theme
 - changed minimum window width to `1100px`
 - changed minimum window height to `625px`
 - ranks are now saved as numbers instead of names

# 0.1.8
 - fixed autoupdater

# 0.1.7
 - fixed missing `open in browser` button accidentally deleted in last release

# 0.1.6
 - errors no longer reset account info
 - set minimum window width to 960px
 - added copy friend code button

# 0.1.5
 - renamed to CS:GO account checker to more accurately represent the main task of this software
 - added checking for prime
 - added icon
 - added installer
 - added auto-updater
 - minor bug fixes

# 0.1.4
 - fixed overwatch bans appearing as VAC bans
 - added Steam Guard support

# 0.1.3
 - added wingman ranks
 - added import from combo list (`user:pass` format, one per line)
 - added delete confirmation(ctrl + click to delete without confirmation)
 - added option to open steam profile in the browser for account
 - made navbar and table header sticky
 - changed icon for "copy password"
 - fixed some bugs

# 0.1.2
 - added private levels
 - added community ban detection

# 0.1.1
 - first release

# 0.1.0
 - initial pre-release