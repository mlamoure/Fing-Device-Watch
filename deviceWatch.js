var util  = require('util');
var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var path = require('path');
var fs = require('fs');
var moment = require('moment');
var NetworkDevice = require("./networkDevice.js");
var Configuration = require("./configuration.js");
var deviceWatchConfiguration;
var networkDevices = new Array();
var dateformat = "YYYY/MM/DD HH:mm:ss";
var fingCommand;
var debug = false;
var configurationFileData;
var convert_min_to_ms = 60 * 1000;

function main() {
	/* THIS IS THE START OF THE APP */
	loadConfiguration(function() {
		runFing();

		fs.watchFile(path.join(__dirname + '/configuration.json'), function (event, filename) {
			console.log("** (" + getCurrentTime() + ") RELOADING CONFIGURATION");

			loadConfiguration(function() {
				reAssignConfiguration();
			});
		});

	});
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
	Function: loadConfiguration(callback)

	Parameters:
		callback = the Callback function that this function calls if configuration is sucessfull.  If it is not sucessful, nothing is called, however an error is placed to the console
*/
function loadConfiguration(callback) {
	clearAlertDevices();
	clearWhiteListDevices();

	deviceWatchConfiguration = new Configuration();

	fs.readFile(path.join(__dirname + '/configuration.json'), 'utf8', function (err, data) {
		if (err) {
			console.log("** (" + getCurrentTime() + ") ERROR LOADING CONFIGURATION: " + err);
			return;
		}

		configurationFileData = JSON.parse(data);

		for (var recordNum in configurationFileData.AlertDevices) {
			newNetworkDevice = processDevice(configurationFileData.AlertDevices[recordNum].mac, 
				undefined, undefined, undefined, undefined);

			newNetworkDevice.setAlertDevice(
				configurationFileData.AlertDevices[recordNum].name,
				configurationFileData.AlertDevices[recordNum].alertMethods[0].method,
				configurationFileData.AlertDevices[recordNum].alertMethods[0].indigoVariableEndpoint,
				configurationFileData.AlertDevices[recordNum].alertMethods[0].ttl)
		}

		for (var recordNum in configurationFileData.WhiteListDevices) {
			newNetworkDevice = processDevice(configurationFileData.WhiteListDevices[recordNum].mac, 
				undefined, undefined, undefined, undefined);

			newNetworkDevice.setWhiteListDevice(configurationFileData.WhiteListDevices[recordNum].name)
		}

		fingCommand_netmask = configurationFileData.FingConfiguration.netmask;
		console.log("** (" + getCurrentTime() + ") CONFIGURATION: Fing netmask being set to: " + fingCommand_netmask);				

		deviceWatchConfiguration.setIndigoUserName(configurationFileData.IndigoConfiguration.username);
		deviceWatchConfiguration.setIndigoPassword(configurationFileData.IndigoConfiguration.password);
		deviceWatchConfiguration.setPasswordProtectFlag(configurationFileData.IndigoConfiguration.passwordProtect);
		deviceWatchConfiguration.setIndigoVariableRefreshRate(configurationFileData.IndigoConfiguration.scanInterval)
		deviceWatchConfiguration.setAWS_AccessKey(configurationFileData.AWS.accessKeyId);
		deviceWatchConfiguration.setAWS_SecretKey(configurationFileData.AWS.secretAccessKey);
		deviceWatchConfiguration.addSNSTopic(configurationFileData.AWSTopicARN);
		deviceWatchConfiguration.setFakePublish(configurationFileData.FakePublish);

		if (configurationFileData.Debug == "true") debug = true;
		else debug = false;
	});
}

function reAssignConfiguration() {
	for (var deviceCounter=0; deviceCounter<networkDevices.length; deviceCounter++)
	{
		networkDevices[deviceCounter].setConfiguration(configuration);
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
		newNetworkDevice.setConfiguration(deviceWatchConfiguration);
		newNetworkDevice.setAlertEmailList(configurationFileData.UnknownDeviceNotification);
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

main();