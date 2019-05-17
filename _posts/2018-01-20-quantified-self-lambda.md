---
layout: post
title:  "Quantified Self and Color Schemes"
author: eli
categories: [ aws, tech ]
image: assets/images/qs9.jpg
featured: true
---

A little toy project: the colors on my website now change every day according to the amount of exercise and meditation I got the day before. Here’s a tutorial.

![]({{site.baseurl}}/assets/images/qs1.png)

*None of this technology is new or even hard, really, but I think connecting it all together makes for a fun and interesting story.*

**QS with Google forms**

![a tiny section of my homescreen with a google forms link]({{site.baseurl}}/assets/images/qs9.jpg)*a tiny section of my homescreen with a google forms link*

I keep track of various aspects of my life in a [google form](https://www.google.com/forms/about/), which is free to make and use. Google forms write directly to a Google spreadsheet. I save a link to the form as a Safari home-screen web link (iOS doesn’t allow this in Chrome, but it does in Safari). Makes it very quick to do each day; takes about 10 seconds to fill out and submit.

**Getting the spreadsheet data out as JSON**

![]({{site.baseurl}}/assets/images/qs2.png)

Google doesn’t exactly make it easy to get this data through an API, but there is a way to turn a spreadsheet into a JSON feed, using a special URL format.

Go to your spreadsheet (should be called “<form name> (Responses)”), click “Share”, make it public, get the shareable link. The key you need is shown in the image above. You plug that into a URL in the following format:

https://docs.google.com/spreadsheets/d/<YOUR KEY HERE>/gviz/tq?tqx=out:json

If you visit that url in the browser, you should get an option to download your data as something approximating JSON.

**Turning data into servable colors**

![a snippet of AWS Lambda color transformation javascript]({{site.baseurl}}/assets/images/qs3.png)*a snippet of AWS Lambda color transformation javascript*

The spreadsheet JSON feed is rate limited; don’t have it load every time someone loads your website — the googs will not be happy.

Instead, I turned to AWS. I made an [AWS Lambda](https://aws.amazon.com/lambda/) function that pulls from the spreadsheet url, parses the almost-JSON, transforms it into a tiny block of JSON with color info according to the data, and stores that in a public [S3](https://aws.amazon.com/s3/) bucket. Here’s a simple version of the lambda code, in case you’re curious:

    var cleanData = function(data) {
        var rows = data.split('"rows":')[1]
        rows = rows.substring(0, rows.length - 4);
        var json = JSON.parse(rows);
        return json
    };

    exports.handler = function(event, context) {
      https.get(SPREADSHEET_URL, function(res) {
        var body = '';
        res.on('data', function(chunk) {
          // Agregates chunks
          body += chunk;
        });
        res.on('end', function() {
          var json = cleanData(body);
          var result = getColors(json);
          // Once you received all chunks, send to S3
          var params = {
            Bucket: 'qs-storage',
            Key: 'qs-data.json',
            Body: result,
            ACL: 'public-read'
          };
          var s3 = new AWS.S3();
          s3.putObject(params, function(err, data) {
            if (err) {
              console.error(err, err.stack);
            } else {
              console.log(data);
            }
          });
        });
      });
    };

The cleanData() function I’ve included up top handles the fact that the spreadsheet data Google gives you is not really JSON at all, but rather executable JS that contains JSON, when all I really want is the JSON data itself. Might there be a better way? Probably. But this worked for me.

The getColors() function is up to you — I took a picture of a bit of it up above, but this is the fun part where you can get creative. How would you like to transform your data into hex colors? Or into something else altogether? A piece of music? A simple graph? A pancake making robot’s morning instructions?

**AWS gotchas**

![choosing a role for your Lambda script]({{site.baseurl}}/assets/images/qs4.png)*choosing a role for your Lambda script*

So many stumbling blocks in the process of getting this Lambda script to run and write to a useful bucket once per day. When you make/configure the script, you’ll pick a role for it, and this role must have the privileges to:

1. Write to S3

1. Write S3 file permissions

So make a new role (as you see I’ve named mine QS3 on my third attempt at getting this right) and edit the policy to have permissions like the picture below, and set the resource to a new S3 bucket that you create for the occasion.

![]({{site.baseurl}}/assets/images/qs5.png)

If you look at the params we pass in the Lambda script during the S3.putObject() call, you’ll see that they include ACL: ‘public-read’ . Otherwise, every time you push your new data into the bucket, the ACL will get reset back to private on the new file.

Also, you have to make the bucket itself open to the public, which you can do through the AWS interface. They definitely don’t make it easy to accidentally expose your data to the whole world anymore.

![S3 bucket permissions page]({{site.baseurl}}/assets/images/qs6.png)*S3 bucket permissions page*

**Run it every day**

![CloudWatch configuration]({{site.baseurl}}/assets/images/qs7.png)*CloudWatch configuration*

This part was pretty easy — obviously we need that Lambda script running on its own. Set up an [AWS CloudWatch](https://aws.amazon.com/cloudwatch/) rule to run the script on the frequency that you push data to your form. For once AWS configuration worked the first time I tried it.

**Serving the colors to my website**

Now we want to grab the S3 bucket data whenever a web page loads, which means grabbing it with client-side javascript. All well and good except that’s a Cross-Origin-Resource-Sharing situation, aka everyone’s favorite pal CORS. So in your S3 bucket options under CORS configuration, add the following XML:

    <?xml version="1.0" encoding="UTF-8"?>
    <CORSConfiguration xmlns="[http://s3.amazonaws.com/doc/2006-03-01/](http://s3.amazonaws.com/doc/2006-03-01/)">
    <CORSRule>
        <AllowedOrigin>*</AllowedOrigin>
        <AllowedMethod>GET</AllowedMethod>
        <MaxAgeSeconds>3000</MaxAgeSeconds>
        <AllowedHeader>*</AllowedHeader>
    </CORSRule>
    </CORSConfiguration>

I did say there were a lot of AWS gotchas.

But if you’ve successfully navigated an admittedly bureaucratic interface and set up the whole chain, you should be able to load this JS on any website:

    $.get('https://s3.amazonaws.com/<Your bucket name>/<your file name>?crossorigin=anonymous').then(
        function(x) {
          data = JSON.parse(x);
          console.log(data);
        }
      );

Obviously you’ll have to put in your own bucket and file name to see your own data… but you can run the javascript on my website if you just want to see it in action using my data.

**Using the colors on the frontend**

![so garish omg]({{site.baseurl}}/assets/images/qs8.png)*so garish omg*

From there it’s finally easy; since the JSON being returned is just a few color options, I set various elements of the site to those colors with jQuery:

    $('.item').css('background-color', data.mainColor); //etc

And we end up with the garish color scheme you see above. The data transformation part is going to be a fun work in progress for a long time to come.

**Conclusions**

I hope this tutorial is helpful! I had a lot of fun levelling up my AWS skills and playing with color finding math. I’m happy to answer questions about any part of it, just leave a comment here or email me at gmail (elialbert).
