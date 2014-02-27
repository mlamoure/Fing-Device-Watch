Fing Device Watch
---
A node.js implementation of a Fing wrapper that can notify via HTTP (more methods such as Amazon SNS to be added in the future) when a device on your network changes. Designed to be used as a dedicated and persistent network monitor that can notify home automation servers when specific devices come on and offline.  Additionally, there is the start to a implementation of a whitelist, where non-whitelisted devices will be notified to you via email.

deviceWatch.js can be extremely useful for Perceptive Automation's Indigo Home Automation Server as a proximity sensor when your cellphone arrives on a network.  Once configured, your home automation system can react to changes of your arrival, or alter behavior based on your known presence.  devicewatch.js does not need to be on the same machine as your Indigo server, as long as it's on the same network.

deviceWatch.js works great on a Raspberry Pi as a dedicated netowrk monitor.  You can get your Raspberry Pi set up with Node.js using these instructions: http://blog.rueedlinger.ch/2013/03/raspberry-pi-and-nodejs-basic-setup/

Installation
---

	1. Install Fing (http://www.overlooksoft.com/fing)

	2. Install Node.js (http://nodejs.org)

	3. Install the following NPM Packages that deviceWatch.js is dependent on: 
						npm install csv
						npm install --save moment
						npm install needle
						npm install node-schedule
						npm install aws-sdk
						npm install nodemailer --save

	4. If using this with Perceptive Automation's Indigo, create Indigo variables for each of the devices you would like to track.
	The variables can be named however you wish, keep the naming memorable, and keep track of them as you will need the information in the next few steps.

	5. Capture and write down the mac addresses for each of the devices you have created variables for, you will need this as you configure deviceWatch.js in the next step.

	Many people use mobile phones as alert devices.  The mac address for your mobile phone can be found in your settings.

	For iOS, there is a tutorial here: http://oit2.utk.edu/helpdesk/kb/entry/2099/

	6. Create a copy of deviceWatch.conf.sample and name it deviceWatch.conf.  Keep it in the same directory as deviceWatch.js.

	7. Modify the new configuration file based on the instructions in the comments.

	8. Run manually via: sudo node deviceWatch.js
	
		Alternatively: Set the script to load on bootup.  This can be done with a simple init.d script for Linux.  I have not done this yet for Mac OS X.

		OS X Users: in order to automate the entering of your admin password (required for Fing), use the following way of launching the deviceWatch.js script:
			
			echo [Admin Password] | sudo -S node deviceWatch.js

	9. Be sure to rotate the logs, or send the output to /dev/null.  The program is rather verbose, especially if you enable debugging via the configuration file.

Supported Alert Methods
---
	1. "method": "indigo" - this will reach out to a Indigo server and sync the state with a variable on the server.  When Fing sees a device state change, it will tell indigo after a set amount of time.  You must set the "indigoVariableEndpoint" property for this method in the config.

	2. "method": "sns" - A more generic notification method, allowing you to distribute the message of the device state change to a HTTP endpoint, email or other.  See Amazon's SNS FAQ for more information (http://aws.amazon.com/sns/faqs/).  You must set the "AWSTopicARN" property for this method in the config.

Change Log
---
2014-1-13: Major code refactoring.  Now object oriented (make sure you do a full git clone to obtain the new .js files).  Added node-schedule support to improve event based and scheduled items, relyng less on polling.  Should significantly improve performance and speed up notifications when devices come off the network and the TTL expires.  The Device_Scan_Interval configuration option has now been depreciated.

2014-1-12: Fixed some async annoyances that would update Indigo more frequently than needed.

2013-12-29: Added support for configuration file changes while deviceWatch.js is running.  This could potentially allow for integration from outside scripts where you may add Whitelist or Alert devices and deviceWatch.js will react in real time.  The configuration will be reloaded once changes are observed.
			Added support for notification method (email) for non-whitelisted devices.
			
2013-12-21: Added a configuration file support, no need to edit the code to set your alert devices any longer.	
			Added support for password protected Indigo servers, set your password in the configuration file.
			No longer uses "curl" to send updates to Indigo
			Added support to check indigo's current state and only sends updates when Fing reports a difference than Indigo's saved value

