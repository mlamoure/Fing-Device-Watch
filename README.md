Fing Device Watch
---
A node.js implementation of a Fing wrapper that can notify via HTTP when a device on your network changes. Useful for Indigo Home Automation Server as a proximity sensor when your cellphone arrives on a network.

Requirements & Installation
---

	1. Install Fing (http://www.overlooksoft.com/fing)

	2. Install Node.js (http://nodejs.org)

	3. Install the following NPM Packages: 
						npm install csv
						npm install --save moment
						npm install needle

Note: this works great on a Raspberry Pi using these instructions to install Node.js : http://blog.rueedlinger.ch/2013/03/raspberry-pi-and-nodejs-basic-setup/

Configuration
---

1. Create a copy of devicewatch.conf.sample and name it devicewatch.conf

2. Modify the new configuration file based on the instructions in the comments

3. Run manually via: node devicewatch.js
	Alternatively: Set the script to load on bootup.  This can be done with a simple init.d script for Linux.  I have not done this yet for Mac OS X.

	OS X Users: in order to automate the entering of your admin password (required for Fing), use the following way of launching the devicewatch.js script:
		
		echo {Admin Password} | sudo -S node devicewatch.js

4. Be sure to rotate the logs, or send the output to null.  The program is rather verbose, especially if you enable debugging via the configuration file.

Change Log
---

2013-12-21: Added a configuration file support, no need to edit the code to set your alert devices any longer.	
			Added support for password protected Indigo servers, set your password in the configuration file.
			No longer uses "curl" to send updates to Indigo
			Added support to check indigo's current state and only sends updates when Fing reports a difference than Indigo's saved value