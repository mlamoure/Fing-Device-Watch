var util  = require('util');
var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var fs = require('fs');
var path = require('path');
var csv = require('csv');
var moment = require('moment');
var schedule = require('node-schedule');

var NetworkDevice = require("./networkDevice.js");
var JSONConfigurationController = require("./JSONConfigurationController.js");

var configuration;
var networkDevices = new Array();

var dateformat = "YYYY/MM/DD HH:mm:ss";
var fingCommand;
var nonWhiteListedDeviceWarnIntervalID;
var configFileIncPath = path.join(__dirname + '/configuration.json');
var convert_min_to_ms = 60 * 1000;

function main() {
	fs.unwatchFile(configFileIncPath);

	clearAlertDevices();
	clearWhiteListDevices();

	configuration = new JSONConfigurationController();
	configuration.setConfiguration(configFileIncPath);
	configuration.on("configComplete", postConfiguration);
	configuration.on("reset", resetConfiguration);
}

function resetConfiguration() {
	clearAlertDevices();
	clearWhiteListDevices();
}

function postConfiguration() {
	for (var recordNum in configuration.data.AlertDevices) {
		newNetworkDevice = processDevice(configuration.data.AlertDevices[recordNum].mac, 
			undefined, undefined, undefined, undefined);

		newNetworkDevice.setAlertDevice(
			configuration.data.AlertDevices[recordNum].name,
			configuration.data.AlertDevices[recordNum].ttl)

		newNetworkDevice.setAlertMethods(
			configuration.data.AlertDevices[recordNum].alertMethods)
	}

	for (var recordNum in configuration.data.WhiteListDevices) {
		newNetworkDevice = processDevice(configuration.data.WhiteListDevices[recordNum].mac, 
			undefined, undefined, undefined, undefined);

		newNetworkDevice.setWhiteListDevice(configuration.data.WhiteListDevices[recordNum].name)
	}

	console.log("** (" + getCurrentTime() + ") CONFIGURATION: Fing netmask being set to: " + configuration.data.FingConfiguration.netmask);				

	if (typeof fingCommand !== 'undefined') {
		fingCommand.stdin.pause();
		fingCommand.kill();
	}

	if (typeof nonWhiteListedDeviceWarnIntervalID !== 'undefined')
	{
		clearInterval(nonWhiteListedDeviceWarnIntervalID);
	}

	assignConfiguration();

	runFing();

	nonWhiteListedDeviceWarnIntervalID = setInterval(function() {
		clearUnknownDevicesReportedFlag();

	}, configuration.data.NonWhiteListedDeviceWarnInterval * convert_min_to_ms);	
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

function clearUnknownDevicesReportedFlag() {
	for (var deviceCounter=0; deviceCounter<networkDevices.length; deviceCounter++)
	{
		if (!networkDevices[deviceCounter].isWhiteListedDevice())
		{
			networkDevices[deviceCounter].clearUnknownDeviceReportedFlag();
		}
	}
}

function assignConfiguration() {
	if (typeof deviceWatchConfiguration === 'undefined') return;

	for (var deviceCounter=0; deviceCounter<networkDevices.length; deviceCounter++)
	{
		networkDevices[deviceCounter].setConfiguration(deviceWatchConfiguration);
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
	fingCommand = spawn('sudo',['fing', '-n', configuration.data.FingConfiguration.netmask, '-o', 'log,csv,console']);

	fingCommand.stdout.on('data', function (data) {
		
			if (configuration.data.Debug) console.log("Raw Output from fing: " + data);

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
					if (configuration.data.Debug) console.log("** (" + getCurrentTime() + ") Line from Fing being ignored: " + lines[i]);
				}
			}
	});

	fingCommand.on('close', function (code) {
		console.log("** (" + getCurrentTime() + ") Fing process was closed and gave response: " + code);
	});

	fingCommand.on('error', function (err) {
		console.log("** (" + getCurrentTime() + ") Fing process gave error: " + err);
	})
}

function parseFingOutput(data) {
	//console.log(data.toString());
	csv()
	.from.string(data.toString(), {delimiter: ';'})
	.to.array(function(device, count) {
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
		newNetworkDevice.setDeviceState(state);
	}

	if (!newRecord)
	{
		if (configuration.data.Debug) console.log ("\n***************** " + getCurrentTime() + " -- UPDATE DEVICE " + mac + " / " + newNetworkDevice.getMACAddress() + " -- **************");

		newNetworkDevice.setConfiguration(configuration);
		if (typeof(ip) !== 'undefined') newNetworkDevice.setIPAddress(ip);
		if (typeof(state) !== 'undefined') newNetworkDevice.setDeviceState(state);
		if (typeof(fqdn) !== 'undefined') newNetworkDevice.setFQDN(fqdn);
		if (typeof(manufacturer) !== 'undefined') newNetworkDevice.setManufacturer(manufacturer);
	}
	else if (newRecord)
	{
		if (configuration.data.Debug) console.log ("\n***************** " + getCurrentTime() + " -- NEW DEVICE -- **************");
		
		networkDevices[networkDevices.length] = newNetworkDevice;
	}

	newNetworkDevice.logToConsole();

	return newNetworkDevice;
}

function getCurrentTime() {
	return moment().format(dateformat);
}

main();