Fing Device Watch
---
A node.js implementation of a Fing wrapper that can notify via HTTP when a device on your network changes. Useful for Indigo Home Automation Server as a proximity sensor when your cellphone arrives on a network.

Requirements & Installation
---

	1. Fing (http://www.overlooksoft.com/fing)

	2. Node.js (http://nodejs.org)

	3. NPM Packages: csv: npm install csv
						moment: npm install --save moment

Note: this works great on a Raspberry Pi using these instructions to install Node.js : http://blog.rueedlinger.ch/2013/03/raspberry-pi-and-nodejs-basic-setup/

Configuration
---

1. Create a copy of devicewatch.conf.sample and name it devicewatch.conf

2. Modify the new configuration file based on the instructions in the comments

3. Set the script to load on bootup.  This can be done with a simple init.d script for Linux.  I have not done this yet for Mac OS X.

4. Be sure to rotate the logs, or send the output to null.  The program is rather verbose, especially if you enable Debugging via the code.

5. Run the devicewatch script: node devicewatch.js
	
	OS X Users: in order to automate the entering of your admin password (required for Fing), use the following way of launching the devicewatch.js script:
		
		echo {Admin Password} | sudo -S node devicewatch.js

Change Log
---

2013-12-21: Added a configuration file, no need to edit the code to set your alert devices any longer.
				
				Added support for password protected Indigo servers, set your password in the configuration file