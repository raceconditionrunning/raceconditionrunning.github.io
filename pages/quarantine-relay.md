---
title: Quarantine Relay
permalink: quarantine-relay/
layout: default
---

# Race Condition Running Inaugural Quarantine Relay

### Abstract

A ragtag group of hooligans and ne'er-do-wells run around the city for seemingly
no reason whatsoever. They appear to enjoy it and take numerous photos along the
way. This document serves as a record of the events of the first RCR Quarantine
Relay so that future generations --- or more likely, the extraterrestrials who
eventually find Earth after humanity is wiped out by the giant meteor we all
know that 2020 has in store for us --- can better understand the psychological
effects of quarantine life in the first months A.C. (after COVID-19).


### Background

It would have been around this time of the year that one of RCR’s main events
--- the Ragnar Relay --- takes place. Last year, we ran the [Ragnar Northwest
Passage Relay]({{ site.baseurl }}/img/ragnar-team-photo-2019.jpg) and had a blast! We were really
looking forward to reliving this kind of experience, which essentially was a
group camping/road trip. Unfortunately,
[2020](https://twitter.com/NSLCpunk/status/1275822899279073280)
[had](https://i.redd.it/q7u3gx286m251.jpg)
[other](https://twitter.com/Number10cat/status/1262854593446391813)
[plans](https://twitter.com/JBomb11/status/1262421966582996992) and our regular
group runs, as well as goal races, were put on hold indefinitely.

As the novelty and peace of the WFH lull slowly faded, our group of
stereotypically antisocial computer scientists started to miss the community
aspect of running. Running alone and brunching over Zoom was just not the same
without the constant bickering, e-graph lectures, and sneaky group selfies.
Thus, one fine Wednesday (or Thursday, or Monday, who even knows anymore), Ellis
suggested we do a giant relay around Seattle. So we did.


### Methods

The idea was well received and we had 21 people sign up for the race. Our
original plan was to run the relay on May 31. But as they say, men make plans
and 2020 laughs, this time in the form of historic civil unrest. When things
seemed to settle down a bit, June 28 emerged as the new best date, and
fortunately we still had 21 runners ready to go.

The most logistics-heavy but also the most fun part of planning the race was
route design. The Shadow Council started with roughly solving a TSP (in
sub-polynomial time) with each vertex being a runner’s home. The legs were then
extended to hit selfie-worthy places around Seattle, while keeping in mind each
runner’s preferred distance. Our first draft had us starting at 5-ish am and
finishing around 3 am, in the true spirit of Ragnar relays. However, the IRB
decided not to approve our plan, citing ridiculous notions such as "safety" and
"no one wants to wake up at 4:30 just to run." We adjusted our start
and end times to sunrise and sunset, shortening routes and moving the meeting
locations accordingly.

We ended up with decent coverage of most interesting sites in Seattle, from
Seward Park, I-90, Lake Washington Blvd to UW campus and northwest Seattle parks
like Carkeek and Golden Gardens. Finally, it was only appropriate that we end at
the Space Needle, where the finish line ribbon was made of a premium four-ply
Charmin ultra soft toilet paper roll.

Final details:
- Date: June 28, 2020
- Rules: (1) No refunds, no injuries, no complaints! (2) Selfies at handoff
  points, and pretty much anywhere awesome. More photos = more better. (3) Have
  fun!

### Results

<ul>
<li>Stats: 
  <a href="https://docs.google.com/spreadsheets/d/1iEMbmWDeJbkWKeGAOKWLf4-v5O4iTGeA6mhXlM3NP10/edit?usp=sharing">
    <ul>
     <li>82 miles </li>
     <li>13 hours and 40 minutes</li>
     <li>21 runners</li>
     <li>infinite hype</li>
   </ul>
 </a></li>
<li> Weather: perfect! It drizzled a bit in the morning but the sun came out during most of the day.</li>
<li> 
  Giant collage of handoff selfies? Check.
{% assign base_url = site.baseurl | append: "/img/quarantinerelay/" %}
{% assign image_names_array = "0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21" | split: "|" %}

<masonry-image-gallery class="w-100">
    {% for img_name_suffix in image_names_array %}
        {% assign img_name = base_url | append: img_name_suffix | append: ".webp" %}
        <a href="{{img_name}}">
            <img loading="lazy" src="{{img_name}}" {% imagesize img_name:props %}/>
        </a>
    {% endfor %}
</masonry-image-gallery>
</li>
<li>
  Huge map with even more selfies? Also check.
  <iframe src="https://www.google.com/maps/d/u/0/embed?mid=1ohLyASs4nkLM6Ys_Z5DScadah8NY-aG7" width="100%" height="480"></iframe>
</li>
</ul>

#### Detailed Results
1. Jennifer -- earliest riser (thanks again!)
2. Zach -- most contemplative (“I was also listening to the autobiography of a
   Zen master and learned about the illusion of the self”)
3. Chandra -- hype captain (for all the quick reacts and zoom hosting during the
   day!)
4. Daniel -- most guest runners in a leg
5. Swati  -- most serious selfie face
6. Maureen -- best post-race decision (pastries from Cafe Flora!) 
7. James -- biggest hill lover (alternatively, most complaining)
8. Willie -- best photo captions
9. Max -- funniest selfie faces
10.  Ellis -- most `@channel` pings
11.  Remy -- most multicolored
12.  Gus -- closest time estimate (pace was within 1 sec/mile!)
13.  Yuxuan -- most UW spirit
14.  Trang -- Ravenna rockstar (ran into a live band!)
15.  Ewin -- most transcendental run (3.14 miles)
16.  Stephen -- best hair (and it wasn't even close, though he was close on
     James' heels)
17.  Lauren -- best medal designer

     <img style="max-width: 100%; max-height: 200px; margin: auto; display: block;" src="/img/quarantine-relay-medal.png">
18.  Eric -- best race report 

     > “The sun was out in full force as I arrived at Sandel Park for my leg.
     > After baking for a few blocks on a residential street, I dropped into
     > Carkeek, where it immediately felt 15 degrees colder. The descent to the
     > parking lot was fast, though slower than I hoped because of foot traffic.
     > I burned several minutes on a detour to the railway bridge to get a Puget
     > Sound selfie, where again I was waiting for people to pass. Then, I
     > hustled through a very steep climb up the South Butte over several stair
     > sections, a beautiful section of forest, before finishing on an
     > uninteresting stretch of streets, meeting Nick at a sad, closed down
     > sushi restaurant.”

19.  Nick -- longest leg (though likely not longest legs)
20.  Aishwarya -- coffee and puppy connoisseur 
21.  Amanda -- best finish line breaking


Common themes:
- A few almost-accidents, yikes!
- “Seattle is hilly!” - exclaimed a few runners.
- Lots of bird/flying-animal encounters: Jennifer witnessed a baby crow
  screaming at its parent, Zach saw a great blue heron and then an eagle eating
  a bird, Gus got some side eyes from bird watchers, Lauren got a classic pic
  with Green Lake ducks, Ewin had a close encounter with a bee, and Ellis
  stepped in goose poo.
- Everything went surprisingly smoothly: everyone was on time, no one got lost
  or drove a van into a ditch, and 2020 paused its catastrophe-dump for the day.

### Conclusion

With p < 0.5 and no chance of Type II Error, the relay was Type I fun. 10/10
experts agree, would do again.


![Conclusion Graph]({{ site.baseurl }}/img/quarantine-relay-zachgraph.png){: style="max-width: 100%; margin: auto; display: block" }

---

### Reviews
 
**R1:** This work is innovative, inspirational, and miles ahead of any race
        report I’ve ever read. I recommend acceptance without further revision.

**R2:** Fails to cite my relay-ted work. Strong reject.

**R3:** Strong accept. I am an expert in this domain and will champion this
        relay by running the entire route by myself next time.


<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/photoswipe/5.4.2/photoswipe.min.css" integrity="sha512-LFWtdAXHQuwUGH9cImO9blA3a3GfQNkpF2uRlhaOpSbDevNyK1rmAjs13mtpjvWyi+flP7zYWboqY+8Mkd42xA==" crossorigin="anonymous" referrerpolicy="no-referrer" />

<script type="module">
    import { MasonryImageGallery } from "{{ site.baseurl }}/js/MasonryImageGallery.js";
</script>
