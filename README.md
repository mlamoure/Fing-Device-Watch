
Requirements:

	1. Fing (http://www.overlooksoft.com/fing)

	2. Node.js (http://nodejs.org)

	3. NPM Packages: csv (https://github.com/wdavidw/node-csv, npm install csv) and moment (https://npmjs.org/package/moment, npm install --save moment)

Note: this works great on a Raspberry Pi using these instructions to install Node.js : http://blog.rueedlinger.ch/2013/03/raspberry-pi-and-nodejs-basic-setup/

Configuration:

	1. Edit devicewatch.js and modify the Array in the loadConfiguration() function.  Use the comments to understand the fields.  Make sure to modify fingCommand_netmask to match your network IPs.

	2. Set the script to load on bootup.  This can be done with a simple init.d script for Linux.  I have not done this yet for Mac OS X.

	3. Be sure to rotate the logs, or send the output to null.  The program is rather verbose, especially if you enable Debugging via the code.