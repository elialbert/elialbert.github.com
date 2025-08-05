---
layout: tech
title: Reolink cameras, Scrypted, LLM security guards
date: 2025-08-05T05:19:00.000-05:00
tags:
  - reolink
  - security
  - home-assistant
  - hass
  - haos
---
I had a simple Blink security setup that wasn't scriptable / integratable with Home Assistant because Blink is a crappy amazon company. Been meaning to upgrade this for a while.

Finally switched to Reolink with 4 cameras: 2 510-wa, 1 811-wa, 1 E1 outdoor.

I connected everything to Home Assistant with Scrypted NVR and it looked great, at first. 

But then the two older 510s were giving me intermittent disconnections that were a devil to debug. 

* worse during the day than at night
* not a power issue (cameras still on, just disconnected from wifi for 1 minute at a time)
* super close to wifi router
* when moved inside, didn't exhibit the issue (so is it heat?)
* when moved back outside on a cool day, still disconnected
* when plugged into ethernet, less issues but still some
* when unscrewed from wall, and pointed skyward, less issues but still some, but almost none
