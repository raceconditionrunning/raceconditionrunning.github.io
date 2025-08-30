---
title: About
permalink: /about/
layout: default
---

# About

Race Condition Running is a run club in Seattle, WA. They run most weekdays from the campus of the University of Washington, where many of their runners are students and faculty. The community knows the club as Saturday morning brunch patrons as well as relay-, train-, and circle-runners.

## What is a Race Condition?

In concurrent programming, a [race condition](https://en.wikipedia.org/wiki/Race_condition) occurs when a program’s behavior depends on the non-deterministic timing of events. Consider two users trying to book the last seat on a flight simultaneously. Without proper synchronization, both requests may be allowed to succeed, leading to an inconsistent state (a seat sold twice).

Race conditions are feared because they occur unpredictably and are difficult to debug.



<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "SportsOrganization",
    "name": "{{ site.title }}",
    "url": "{{ site.url }}",
    "description": "{{ site.description }}",
    "logo": "{{ site.url }}/img/rcc-logo.png",
    "foundingDate": "2014",
    "location": {
      "@type": "Place",
      "name": "Paul G. Allen Center for Computer Science & Engineering (CSE2), University of Washington",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "185 E Stevens Way NE",
        "addressLocality": "Seattle",
        "addressRegion": "WA",
        "postalCode": "98195",
        "addressCountry": "US"
      }
    },
    "sameAs": [
      "https://www.strava.com/clubs/raceconditionrunning",
      "https://www.athletic.net/team/91232",
      "https://github.com/raceconditionrunning/"
    ]
  }
</script>