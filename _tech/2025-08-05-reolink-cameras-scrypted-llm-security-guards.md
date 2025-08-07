---
layout: tech
title: Reolink cameras, Scrypted, LLM security guards
date: 2025-08-05T05:19:00.000-05:00
author: eli
categories: [ smart-home ]
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

I finally figured it out - between the Reolink app, the camera's onboard motion detection, and the various camera feeds opened by Home Assistant and Scrypted, I was maxing out the older cameras' on-board systems but *only while doing lots of motion detection.*\
\
Anyway I switched off of Scrypted and on to Frigate, set up a less intense feed system, and now everything is great.\
\
Finally had it working so then I set up [LLM Vision](https://llmvision.org/) as an action in Home Assistant and used it to write some custom automations that, using the camera's on-board person detection as a trigger, send a little clip to Claude Haiku to let me know if anything suspicious is happening along the side or back of my house. It push notifies and records an event in Frigate. So far nothing suspicious has happened (5-10 false positives tho...) at the cost of 2 cents per day.[](https://llmvision.org/)
