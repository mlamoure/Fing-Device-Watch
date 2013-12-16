
Requirements:

	1. Fing (http://www.overlooksoft.com/fing)

	2. Node.js (http://nodejs.org)

	3. NPM Packages: csv (https://github.com/wdavidw/node-csv, npm install csv) and moment (https://npmjs.org/package/moment, npm install --save moment)

Note: this works great on a Raspberry Pi using these instructions to install Node.js : http://blog.rueedlinger.ch/2013/03/raspberry-pi-and-nodejs-basic-setup/

Configuration:

	1. Edit devicewatch.js and modify the Array in the loadConfiguration() function.  Use the comments to understand the fields.  Make sure to modify fingCommand_netmask to match your network IPs.