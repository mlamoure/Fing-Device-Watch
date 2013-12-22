/*
	Fing Output example:
		2013/12/12 18:14:32;up;10.66.0.11;;camera2.home.mikelamoureux.net;F0:7D:68:09:B7:6B;D-Link

	Fing Array:
		[0]: Date
		[1]: State (up, down, changed)
		[2]: IP Address
		[3]: Unknown
		[4]: DNS Domain
		[5]: Mac Address
		[6]: Manufacturer
		[7]: Common Known Name


	[NetworkDevices]:
		[0] = Mac Address
		[1] = State
		[2] = IP Address
		[3] = White Listed (true or false)
		[4] = Alert Device (true or false)
		[5] = Manufacturer
		[6] = Fing Timestamp
		[7] = Timeout expiration for declaring "off" network
		[8] = Previously Reported (for non-whitelisted devices)
		[9] = Fully qualified domain name
		[10] = Indigo State
*/

var util  = require('util'),
    spawn = require('child_process').spawn,
    exec = require('child_process').exec,
	fs = require('fs'),
	csv = require('csv'),
	needle = require('needle'),
	networkDevices = new Array,
	whiteListDevices = new Array,
	alertDevices = new Array,
	moment = require('moment'),
	fingCommand_netmask,
	dateformat = "YYYY/MM/DD HH:mm:ss",
	fingCommand,
	debug = false,
	indigo_Password_Protect = false,
	indigo_Password,
	indigo_UserName,
	indigo_scan_interval,
	device_scan_interval,
	convert_min_to_ms = 60 * 1000;


/* THIS IS THE START OF THE APP */
loadConfiguration(function() {
	runFing();

	setInterval(function() {
		processDevices();
	}, device_scan_interval);

	setInterval(function() {
		refreshAlertDeviceIndigoStatus();
	}, indigo_scan_interval);

});

function refreshAlertDeviceIndigoStatus() {
	for (var deviceCounter=0; deviceCounter<networkDevices.length; deviceCounter++)
	{
		if (isAlertDevice(deviceCounter))
		{
			updateIndigoState(deviceCounter, getAlertIndex(deviceCounter));
		}
	}
}

function loadConfiguration(callback) {
	var fs = require('fs');
	var csv = require('csv');

	csv()
	.from.path(__dirname+'/devicewatch.conf', { delimiter: ',', comment: '#', ltrim: 'true', rtrim: 'true' })
	.to.array( function(data, count) {
		for (var i = 0; i < count; i++)
		{
			// Do not wrap this in a if (debug) since the debug configuration may not have been read and set yet.
			console.log("** (" + getCurrentTime() + ") CONFIGURATION: About to process: " + data[i]);

			if (data[i][0] == "AlertDevice")
			{
				alertDevices[alertDevices.length] = [data[i][1], data[i][2], data[i][3], data[i][4], data[i][5]];
				whiteListDevices[whiteListDevices.length] = [data[i][1], data[i][2]];
			}
			else if (data[i][0] == "WhiteListDevice")
			{
				whiteListDevices[whiteListDevices.length] = [data[i][1], data[i][2]];
			}
			else if (data[i][0] == "Netmask")
			{
				fingCommand_netmask = data[i][1];
				if (debug) console.log ("Configuration: Netmask is being set to " + fingCommand_netmask);
			}
			else if (data[i][0] == "Indigo_Password_Protect")
			{
				if (data[i][1] == "true") indigo_Password_Protect = true;
				else indigo_Password_Protect = false;
			}
			else if (data[i][0] == "Indigo_UserName")
			{
				indigo_UserName = data[i][1];
			}
			else if (data[i][0] == "Indigo_Password")
			{
				indigo_Password = data[i][1];
			}
			else if (data[i][0] == "Debug")
			{
				if (data[i][1] == "true") debug = true;
				else debug = false;
			}
			else if (data[i][0] == "Indigo_Scan_Interval")
			{
				indigo_scan_interval = data[i][1] * convert_min_to_ms;

				// Do not wrap this in a if (debug) since the debug configuration may not have been read and set yet.
				console.log("** (" + getCurrentTime() + ") CONFIGURATION: Indigo Scan Interval set to: " + indigo_scan_interval);				
			}
			else if (data[i][0] == "Device_Scan_Interval")
			{
				device_scan_interval = data[i][1] * convert_min_to_ms;

				// Do not wrap this in a if (debug) since the debug configuration may not have been read and set yet.
				console.log("** (" + getCurrentTime() + ") CONFIGURATION: Device Scan Interval set to: " + device_scan_interval);				
			}
		}
	})
	.on('end', function(count){
  		callback();
	})
	.on('error', function(error){
	  console.log("** (" + getCurrentTime() + ") Something is wrong with your config file: " + error.message);
	});
}

function runFing(fingCommand)
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
					parseDevice(lines[i]);
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

function parseDevice(data) {
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

		updateDevice(mac, state == "up", ip_address, manufacturer, timestamp, fqdn);
	});
}

function getDeviceIndex(mac)
{
	for (var deviceCounter=0; deviceCounter<networkDevices.length; deviceCounter++)
	{
		if (networkDevices[deviceCounter][0] == mac)
		{
			return deviceCounter;
		}
	}

	return -1;
}

function updateDevice(mac, state, ip_address, manufacturer, fingTimestamp, fqdn)
{
	var whiteListIndex = -1;
	var alertIndex = -1;
	var whiteListDeviceFlag = false;
	var alertDeviceFlag = false;
	var alertExpiration = getCurrentTime();
	var indigoValue;
	var newRecord = false;
	var deviceIndex = getDeviceIndex(mac);
	var previouslyReported = false;

	if (deviceIndex > -1)
	{
		if (debug) console.log ("\n***************** " + getCurrentTime() + " -- UPDATE DEVICE -- **************");

		newRecord = false;

		whiteListDeviceFlag = isWhiteListedDevice(deviceIndex);
		alertDeviceFlag = isAlertDevice(deviceIndex);
		indigoValue = getIndigoState(deviceIndex);
		previouslyReported = wasPreviouslyReported(deviceIndex);

		// if the new state is false and it is a alert device, set the alert Expiration
		if (alertDeviceFlag && !state)
		{
			alertIndex = getAlertIndex(deviceIndex);
			alertExpiration = getNewAlertTimeoutExpriation(alertIndex);
		}		
	}

	if (deviceIndex == -1)
	{
		if (debug) console.log ("\n***************** " + getCurrentTime() + " -- NEW DEVICE -- **************");

		newRecord = true;
		deviceIndex = networkDevices.length;
	}

	networkDevices[deviceIndex] = [mac, state, ip_address, whiteListDeviceFlag, alertDeviceFlag, manufacturer, fingTimestamp, alertExpiration, previouslyReported, fqdn, indigoValue];
	
	// For new devices, we need to check if the device is an "Alert Device", only for new devices
	if (newRecord)
	{
		alertIndex = getAlertIndex(deviceIndex);
		whiteListIndex = getWhiteListIndex(deviceIndex);

		if (alertIndex >= 0)
		{
			alertDeviceFlag = true;
			networkDevices[deviceIndex][4] = alertDeviceFlag;
		}

		if (whiteListIndex >= 0)
		{
			whiteListDeviceFlag = true;
			networkDevices[deviceIndex][3] = whiteListDeviceFlag;
		}
	}

	if (isReadyforAlert(deviceIndex)) alertDevice(deviceIndex);

	logToConsole(deviceIndex);
}

function logToConsole(deviceIndex)
{
	if (debug)
	{
		var alertIndex = getAlertIndex(deviceIndex);
		var whiteListIndex = getWhiteListIndex(deviceIndex);

		console.log("\t***************** -- Device Details -- **************");
		console.log("\t\tCurrent Time: " + getCurrentTime());
		console.log("\t\tIndex: " + deviceIndex);
		console.log("\t\tMac: " + getMacAddress(deviceIndex));
		console.log("\t\tIP Address: " + getIPAddress(deviceIndex));
		console.log("\t\tFQDN: " + getFQDN(deviceIndex));
		console.log("\t\tState: " + getDeviceState(deviceIndex));

		console.log("\t\tWhite List Flag: " + isWhiteListedDevice(deviceIndex)+ " (index: " + whiteListIndex + ")");
		console.log("\t\tAlert Device Flag: " + isAlertDevice(deviceIndex) + " (index: " + alertIndex + ")");

		if (isAlertDevice(deviceIndex)) console.log("\t\tAlert Device Name: " + alertDevices[alertIndex][0]);
		if (isWhiteListedDevice(deviceIndex)) console.log("\t\tWhite List Device Name: " + whiteListDevices[whiteListIndex][0]);

		console.log("\t\tFing last update timestamp: " + getFingTimestamp(deviceIndex));
		console.log("\t\t\"Off network\" Expiration Time: " + getExpirationTime(deviceIndex));
		console.log("\t\tCached Indigo Value: " + getIndigoState(deviceIndex));
		console.log ("\t*****************************************************************\n");	
	}
}

function getCurrentTime() {
	return moment().format(dateformat);
}

function getNewAlertTimeoutExpriation(alertIndex) {
	var newExpiration = moment().add('m', alertDevices[alertIndex][4]).format(dateformat);

	console.log("** (" + getCurrentTime() + ") New expiration for " + alertDevices[alertIndex][0] + ": " + newExpiration);

	return (newExpiration);
}

function getAlertIndex(deviceIndex) {
	if (deviceIndex > networkDevices.length - 1) return -1;

	for (var alertCounter=0; alertCounter<alertDevices.length; alertCounter++)
	{
		if (networkDevices[deviceIndex][0].toUpperCase() == alertDevices[alertCounter][1].toUpperCase())
		{
			if (networkDevices[deviceIndex][4] == false)
			{
				console.log("** (" + getCurrentTime() + ") Alert Device Flag being toggled for device: " + alertDevices[alertCounter][0]);

				// set the "Alart Device" flag to true
				networkDevices[deviceIndex][4] = true;
			}

			return alertCounter;
		}
	}
	return -1;
}

function isReadyforAlert(deviceIndex) {
	var alertIndex = getAlertIndex(deviceIndex);

	// if it's not a device that needs to be announced (alert flag is false)	
	if (!isAlertDevice(deviceIndex)) {
		return false;
	}

	if (typeof getIndigoState(deviceIndex) === 'undefined') {
		updateIndigoState(deviceIndex, alertIndex);
	}
	
	console.log("** (" + getCurrentTime() + ") Cached Indigo value of " + alertDevices[alertIndex][0] + " is: " + getIndigoState(deviceIndex) + ", current state from fing is " + getDeviceState(deviceIndex));

	if (!getIndigoState(deviceIndex) && getDeviceState(deviceIndex))
	{
		return true;
	}
	else if (getDeviceState(deviceIndex) == getIndigoState(deviceIndex))
	{
		console.log("** (" + getCurrentTime() + ") Not going to send an alert for device " + alertDevices[alertIndex][0] + " because Indigo is already set appropriately");
		return false;		
	}
	else if (getCurrentTime() < getExpirationTime(deviceIndex)) {
		console.log("** (" + getCurrentTime() + ") Not going to send an alert for device " + alertDevices[alertIndex][0] + " because the expiration time has not passed (" + getExpirationTime(deviceIndex) + ")");
		return false;
	}

	return true;
}

function isAlertDevice(deviceIndex)
{
	return networkDevices[deviceIndex][4];
}

function alertDevice(deviceIndex) {
	var alertIndex = getAlertIndex(deviceIndex);

	if (alertIndex == -1) return;
	var setValue;

	if (getDeviceState(deviceIndex))
	{
		setValue = "value=true"
	}
	else
	{
		setValue = "value=false"
	}

	console.log("** (" + getCurrentTime() + ") ALERT ** Alert being sent for device - " + alertDevices[alertIndex][0] + ": State is " + setValue);

	if (indigo_Password_Protect)
	{
		needle.put(getAlertDeviceURL(alertIndex), setValue, { username: indigo_UserName, password: indigo_Password, auth: 'digest' }, function() {
			//
		})
	}
	else
	{
		needle.put(getAlertDeviceURL(alertIndex), setValue, function() {
			//
		})
	}
}

function getDeviceState(deviceIndex)
{
	if (typeof(networkDevices[deviceIndex][1]) == "boolean") return (networkDevices[deviceIndex][1]);

	switch (networkDevices[deviceIndex][1].toUpperCase())
	{
		case "UP":
			return (true);
		case "TRUE":
			return (true);
		case "DOWN":
			return (false);
		case "FALSE":
			return (false);
	}

	return false;
}

function updateIndigoState(deviceIndex, alertIndex)
{
	var indigoValue = false;

	needle.get(getAlertDeviceURL(alertIndex) + ".txt", function(err, resp, body) {
		csv()
		.from(body, { delimiter: ':', ltrim: 'true', rtrim: 'true' })
		.to.array( function(data, count) {
			if (debug) console.log("** (" + getCurrentTime() + ") Raw HTTP request results from Indigo: \n" + body);
			indigoValue = data[5][1] == "true";
			
			logToConsole(deviceIndex);

			console.log("** (" + getCurrentTime() + ") Obtained and saved the current value of indigo variable " + alertDevices[alertIndex][0] + " is: " + indigoValue);
			networkDevices[deviceIndex][10] = indigoValue;
		});
	});				
}

function getIndigoState(deviceIndex)
{
	return (networkDevices[deviceIndex][10]);
}

function getAlertDeviceURL(alertIndex)
{
	return (alertDevices[alertIndex][3]);
}

function isWhiteListedDevice(deviceIndex)
{
	return (networkDevices[deviceIndex][3]);
}

function wasPreviouslyReported(deviceIndex)
{
	return (networkDevices[deviceIndex][8]);
}

function getWhiteListIndex(deviceIndex) {
	for (var whiteListCounter = 0; whiteListCounter < whiteListDevices.length; whiteListCounter++)
	{
		if (whiteListDevices[whiteListCounter][1].toUpperCase() == networkDevices[deviceIndex][0])
		{
			// check to see if it's already marked as a whitelisted device
			if (!networkDevices[deviceIndex][3])
			{
				console.log("** (" + getCurrentTime() + ") Marking whitelisted device: " + whiteListDevices[whiteListCounter][0]);
				networkDevices[deviceIndex][3] = true;
			}
			return whiteListCounter;
		}
	}

	return -1;
}

function reportUnknownDevice(deviceIndex) {
	console.log("** (" + getCurrentTime() + ") ALERT ** Found a device that is not cleared to be on the network: " + networkDevices[deviceIndex][0] + ", " + networkDevices[deviceIndex][2]);

	networkDevices[deviceIndex][8] = true;
}

function getMacAddress(deviceIndex) {
	return (networkDevices[deviceIndex][0]);
}

function getIPAddress(deviceIndex) {
	return (networkDevices[deviceIndex][2]);
}

function getFingTimestamp(deviceIndex) {
	return (networkDevices[deviceIndex][6]);
}

function getExpirationTime(deviceIndex) {
	return (networkDevices[deviceIndex][7]);
}

function getFQDN(deviceIndex) {
	return (networkDevices[deviceIndex][9]);
}


function processDevices() {
	if (debug)
	{
		console.log ("\n***************** " + getCurrentTime() + " -- Processing the list of known devices -- **************");
		console.log ("\tNumber of devices I am aware of: " + networkDevices.length);
	}

	for (var deviceCounter=0; deviceCounter<networkDevices.length; deviceCounter++)
	{
		logToConsole(deviceCounter);

		if (isReadyforAlert(deviceCounter))
		{
			alertDevice(deviceCounter);
		}

		if (!isWhiteListedDevice(deviceCounter) && !wasPreviouslyReported(deviceCounter))
		{
			reportUnknownDevice(deviceCounter);
		}
	}
	
	if (debug) console.log ("Nothing more to do...\n*****************************************************************\n");	
}