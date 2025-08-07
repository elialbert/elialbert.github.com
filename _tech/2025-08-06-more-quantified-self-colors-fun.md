---
layout: tech
title: More quantified self + colors fun
date: 2025-08-06T17:59:00
categories:
  - tech
  - ai
tags:
  - quantified-self
  - hobbies
  - llm
  - ai
  - aws lambda
---
![](/assets/uploads/blogpost.png)

In a long ago [previous post](https://elialbert.com/blog/quantified-self-lambda/) I detailed how I used aws lambda and google sheets to grab recent data about my life and turn it into colors for this very website.
well I just added a tweak to that step, sending yesterday's QS data on my meditation and exercise habits to claude and asking it to turn how it feels about those numbers into the color scheme for this website. So that's where each day's colors are coming from. Fun stuff!
It took 30 minutes to add the api call to the lambda and test and tweak it a bit. One call should cost me less than a penny a day I think.
