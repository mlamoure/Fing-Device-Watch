var util  = require('util'),
    spawn = require('child_process').spawn,
    exec = require('child_process').exec,
	fs = require('fs'),
	csv = require('csv'),
	moment = require('moment'),
	NetworkDevice = require("./networkDevice.js"),
	Configuration = require("./configuration.js"),
	configuration,
	networkDevices = new Array(),
	notificationEmails,
	snsTopics,
	fingCommand_netmask,
	dateformat = "YYYY/MM/DD HH:mm:ss",
	fingCommand,
	debug = false,
	convert_min_to_ms = 60 * 1000;


/* THIS IS THE START OF THE APP */
loadConfiguration(function() {
	runFing();

	fs.watchFile('devicewatch.conf', function (event, filename) {
		console.log("** (" + getCurrentTime() + ") RELOADING CONFIGURATION");

		loadConfiguration(function() {
			reAssignConfiguration();
		});
	});

});

/*
	Function: loadConfiguration(callback)

	Parameters:
		callback = the Callback function that this function calls if configuration is sucessfull.  If it is not sucessful, nothing is called, however an error is placed to the console
*/
function loadConfiguration(callback) {
	fingCommand_netmask = "";
	configuration = new Configuration();
	debug = false;
	notificationEmails = new Array();
	snsTopics = new Array();

	clearAlertDevices();
	clearWhiteListDevices();

	csv()
	.from.path(__dirname+'/devicewatch.conf', { delimiter: ',', comment: '#', ltrim: 'true', rtrim: 'true' })
	.to.array( function(data, count) {
		for (var i = 0; i < count; i++)
		{
			// Do not wrap this in a if (debug) since the debug configuration may not have been read and set yet.
			console.log("** (" + getCurrentTime() + ") CONFIGURATION: About to process: " + data[i]);

			if (data[i][0] == "AlertDevice")
			{
				newNetworkDevice = processDevice(data[i][2], undefined, undefined, undefined, undefined);
				newNetworkDevice.setAlertDevice(data[i][1], data[i][3], data[i][4], data[i][5])
			}
			else if (data[i][0] == "WhiteListDevice")
			{
				newNetworkDevice = processDevice(data[i][2], undefined, undefined, undefined, undefined);
				newNetworkDevice.setWhiteListDevice(data[i][1])
			}
			else if (data[i][0] == "Netmask")
			{
				fingCommand_netmask = data[i][1];

				// Do not wrap this in a if (debug) since the debug configuration may not have been read and set yet.
				console.log("** (" + getCurrentTime() + ") CONFIGURATION: Fing netmask being set to: " + fingCommand_netmask);				
			}
/*			else if (data[i][0] == "Indigo_Password_Protect")
			{
				if (data[i][1] == "true") indigo_Password_Protect = true;
				else indigo_Password_Protect = false;
			}
*/			else if (data[i][0] == "Indigo_UserName")
			{
				configuration.setIndigoUserName(data[i][1]);
			}
			else if (data[i][0] == "Indigo_Password")
			{
				configuration.setIndigoPassword(data[i][1]);
			}
			else if (data[i][0] == "Debug")
			{
				if (data[i][1] == "true") debug = true;
				else debug = false;
			}
			else if (data[i][0] == "Indigo_Scan_Interval")
			{
				configuration.setIndigoVariableRefreshRate(data[i][1])

				// Do not wrap this in a if (debug) since the debug configuration may not have been read and set yet.
				console.log("** (" + getCurrentTime() + ") CONFIGURATION: Indigo Scan Interval set to: " + configuration.getIndigoVariableRefreshRate());				
			}
/*			else if (data[i][0] == "Device_Scan_Interval")
			{
				device_scan_interval = data[i][1] * convert_min_to_ms;

				// Do not wrap this in a if (debug) since the debug configuration may not have been read and set yet.
				console.log("** (" + getCurrentTime() + ") CONFIGURATION: Device Scan Interval set to: " + device_scan_interval);				
			}
*/			else if (data[i][0] == "UnknownDeviceNotificationAlert")
			{
				console.log("** (" + getCurrentTime() + ") CONFIGURATION: Added unknwon notification alert for email: " + data[i][2]);				

				// since we support email only atm, this creates a array of notification emails to send.
				notificationEmails[notificationEmails.length] = data[i][2];
			}
			else if (data[i][0] == "AWS_AccessKey_Id")
			{
				console.log("** (" + getCurrentTime() + ") CONFIGURATION: Added AWS Access Key: " + data[i][1]);				

				configuration.setAWS_AccessKey(data[i][1]);
			}
			else if (data[i][0] == "AWS_Secret_Access_Key")
			{
				console.log("** (" + getCurrentTime() + ") CONFIGURATION: Added AWS Secret Access Key: " + data[i][1]);				
				configuration.setAWS_SecretKey(data[i][1]);
			}
			else if (data[i][0] == "SNS_Topic")
			{
				console.log("** (" + getCurrentTime() + ") CONFIGURATION: Added SNS Topic: " + data[i][1]);				

				configuration.addSNSTopic(data[i][1]);
			}
		}
	})
	.on('end', function(count){
		if (callback != null) callback();
	})
	.on('error', function(error){
	  console.log("** (" + getCurrentTime() + ") Something is wrong with your config file: " + error.message);
	});
}

function reAssignConfiguration() {
	for (var deviceCounter=0; deviceCounter<networkDevices.length; deviceCounter++)
	{
		networkDevices[deviceCounter].setConfiguration(configuration);
	}	
}

function clearAlertDevices() {
	for (var deviceCounter=0; deviceCounter<networkDevices.length; deviceCounter++)
	{
		networkDevices[deviceCounter].clearAlertDevice();
	}
}

function clearWhiteListDevices() {
	for (var deviceCounter=0; deviceCounter<networkDevices.length; deviceCounter++)
	{
		networkDevices[deviceCounter].clearWhiteListDevice();
	}
}

/*
	Function: runFing

	Parameters:
		None

	Description:
		This function spawns the Fing process, and then asssigns a action to take upon output from Fing.

		As a critical function for the applicaiton, this function parses the output from Fing and decides what to do with it.
			Critical to this, is the rules that review the raw Fing results, and determine if it's a log message from Fing, or a device action.
			If a device action needs to be taken, parseDevice() is called.


	Known issues:
		If a device has the keywords "Discovery" "hosts up" or "round" in them, this may been seen as a line to ignore.
*/
function runFing()
{
	fingCommand = spawn('sudo',['fing', '-n', fingCommand_netmask, '-o', 'log,csv,console']);

	fingCommand.stdout.on('data', function (data) {
		
			if (debug) console.log("Raw Output from fing: " + data);

			var str = data.toString(), lines = str.split(/(\r?\n)/g);

			for (var i=0; i<lines.length; i++) {
				
				// if the line contains some key characters, or is less than 5 characters in length, ignore it.
				if (lines[i].length > 5 && lines[i].indexOf("Discovery") == -1 && lines[i].indexOf("hosts up") == -1 && lines[i].indexOf("round") == -1)
				{
					console.log("** (" + getCurrentTime() + ") Line from Fing being processed: " + lines[i]);
					parseFingOutput(lines[i]);
				}
				else if (lines[i].length > 5)
				{
					if (debug) console.log("** (" + getCurrentTime() + ") Line from Fing being ignored: " + lines[i]);
				}
			}
	});

	fingCommand.on('close', function (code) {
	  console.log('child process exited with code ' + code);
	});	
}

function parseFingOutput(data) {
	//console.log(data.toString());
	csv()
	.from.string(data.toString(), {delimiter: ';'})
	.to.array( function(device, count) {
		var manufacturer = device[0][6];
		var mac = device[0][5];
		var state = device[0][1];
		var ip_address = device[0][2];
		var timestamp = device[0][0];
		var fqdn = device[0][4];

		processDevice(mac, state == "up", ip_address, fqdn, manufacturer);
	});
}

function findDevice(mac)
{
	for (var deviceCounter=0; deviceCounter<networkDevices.length; deviceCounter++)
	{
		if (networkDevices[deviceCounter].getMACAddress().toUpperCase() == mac.toUpperCase())
		{
			return networkDevices[deviceCounter];
		}
	}

	return undefined;
}

function processDevice(mac, state, ip, fqdn, manufacturer)
{
	var whiteListDeviceFlag = false;
	var alertDeviceFlag = false;
	var alertExpiration = getCurrentTime();
	var indigoValue;
	var newRecord = false;
	var previouslyReported = false;

	var newNetworkDevice = findDevice(mac);

	if (typeof(newNetworkDevice) === 'undefined') {
		newRecord = true;
		newNetworkDevice = new NetworkDevice(mac, ip, fqdn, manufacturer);
		newNetworkDevice.setConfiguration(configuration);
		newNetworkDevice.setAlertEmailList(notificationEmails);
		newNetworkDevice.setDeviceState(state);
	}

	if (!newRecord)
	{
		if (debug) console.log ("\n***************** " + getCurrentTime() + " -- UPDATE DEVICE " + mac + " / " + newNetworkDevice.getMACAddress() + " -- **************");

		newNetworkDevice.setConfiguration(configuration);
		newNetworkDevice.setAlertEmailList(notificationEmails);		
		if (typeof(ip) !== 'undefined') newNetworkDevice.setIPAddress(ip);
		if (typeof(state) !== 'undefined') newNetworkDevice.setDeviceState(state);
		if (typeof(fqdn) !== 'undefined') newNetworkDevice.setFQDN(fqdn);
		if (typeof(manufacturer) !== 'undefined') newNetworkDevice.setManufacturer(manufacturer);
	}
	else if (newRecord)
	{
		if (debug) console.log ("\n***************** " + getCurrentTime() + " -- NEW DEVICE -- **************");
		
		networkDevices[networkDevices.length] = newNetworkDevice;
	}

	newNetworkDevice.logToConsole();

	return newNetworkDevice;
}

function getCurrentTime() {
	return moment().format(dateformat);
}