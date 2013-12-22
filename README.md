Fing Device Watch
---
A node.js implementation of a Fing wrapper that can notify via HTTP (more methods to be added in the future) when a device on your network changes. Designed to be used as a dedicated and persistent network monitor that can notify home automation servers when specific devices come on and offline.  Additionally, there is the start to a implementation of a whitelist, where non-whitelisted devices will be notified to you via email.

devicewatch.js can be extremely useful for Perceptive Automation's Indigo Home Automation Server as a proximity sensor when your cellphone arrives on a network.  Once configured, your home automation system can react to changes of your arrival, or alter behavior based on your known presence.

Requirements & Installation
---

	1. Install Fing (http://www.overlooksoft.com/fing)

	2. Install Node.js (http://nodejs.org)

	3. Install the following NPM Packages that the script is dependent on: 
						npm install csv
						npm install --save moment
						npm install needle

Note: this works great on a Raspberry Pi using these instructions to install Node.js: http://blog.rueedlinger.ch/2013/03/raspberry-pi-and-nodejs-basic-setup/

Configuration
---

1. If using this with Perceptive Automation's Indigo, create Indigo variables for each of the devices you would like to track.
	The variables can be named however you wish, keep the naming memorable, and keep track of them as you will need the information in the next few steps.

2. Write down the mac addresses for each of the devices you have created variables for, you will need this as you configure devicewatch.js in the next step.
	Many people use mobile phones as alert devices.  The mac address for your mobile phone can be found in your settings.

	For iOS, there is a tutorial here: http://oit2.utk.edu/helpdesk/kb/entry/2099/

3. Create a copy of devicewatch.conf.sample and name it devicewatch.conf.  Keep it in the same directory as devicewatch.js.

4. Modify the new configuration file based on the instructions in the comments.

5. Run manually via: node devicewatch.js
	
	Alternatively: Set the script to load on bootup.  This can be done with a simple init.d script for Linux.  I have not done this yet for Mac OS X.

	OS X Users: in order to automate the entering of your admin password (required for Fing), use the following way of launching the devicewatch.js script:
		
		echo {Admin Password} | sudo -S node devicewatch.js

6. Be sure to rotate the logs, or send the output to null.  The program is rather verbose, especially if you enable debugging via the configuration file.

Change Log
---

2013-12-21: Added a configuration file support, no need to edit the code to set your alert devices any longer.	
			Added support for password protected Indigo servers, set your password in the configuration file.
			No longer uses "curl" to send updates to Indigo
			Added support to check indigo's current state and only sends updates when Fing reports a difference than Indigo's saved value