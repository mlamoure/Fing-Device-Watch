function loadConfiguration(configFile) {
	/*
		Define this array with the list of devices you would like to announce when the status changes to Indigo.

		[0]: Friendly name of the device
		[1]: Mac address of the device
		[2]: Mode (http is currently only mode supported)
		[3]: Fully qualified domain name of your Indigo variable that you want to update (e.g. http://192.168.1.100:8176/variables/variable_name)
		[4]: TTL on the network before reporting "off".  This helps reduce errors when a mobile device is reported "off" the network because 
				it hasn't renewed the IP address, but in fact is in power saving mode
	*/

	alertDevices = [["My Phone","xx:xx:xx:xx:xxx:xx", "http","http://192.168.1.100:8176/variables/myCell_onNetwork", 5]
	];

	/*
		This is a list of whitelisted network devies.  As an extra piece of functionality, I had this device watcher provide notifications to
		you when a unknown device is on your network.  I have not yet implemented the "alert" functionality, though I plan to have the server
		simply send an email.
	*/

	whiteListDevices = [
		["My Laptop", "xx:xx:xx:xx:xx:xx"]
	];

	/*
		Place your network address range here.  This is important, if it's not correct, fing will not know what to monitor.
	*/

	fingCommand_netmask = "192.168.1.1/24";
//	fingCommand_netmask = "10.66.0.1/24";
}

/* ############################################################################################################################## */

var util  = require('util'),
    spawn = require('child_process').spawn,
    exec = require('child_process').exec,
	fs = require('fs'),
	csv = require('csv'),
	file = 'devices.csv',
	networkDevices = new Array,
	whiteListDevices,
	alertDevices,
	moment = require('moment'),
	fingCommand_netmask,
	dateformat = "YYYY/MM/DD HH:mm:ss",
	fingCommand,
	debug = false,
	scan_interval = 1 * 60 * 1000;


/* THIS IS THE START OF THE APP */
loadConfiguration();
runFing();

setInterval(function() {
	processDevices();
}, scan_interval);

function runFing(fingCommand)
{
	// Output example:
	// 		2013/12/12 18:14:32;up;10.66.0.11;;camera2.home.mikelamoureux.net;F0:7D:68:09:B7:6B;D-Link

	//		[0]: Date
	//		[1]: State (up, down, changed)
	//		[2]: IP Address
	//		[3]: Unknown
	//		[4]: DNS Domain
	//		[5]: Mac Address
	//		[6]: Manufacturer
	//		[7]: Common Known Name

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

		updateDevice(mac, state, ip_address, manufacturer, timestamp, fqdn);
	});
}

function updateDevice(mac, state, ip_address, manufacturer, fingTimestamp, fqdn)
{
	var recordNumber = -1;
	var whiteListIndex = -1;
	var alertIndex = -1;

	var whiteListDeviceFlag = false;
	var alertDeviceFlag = false;
	var alertExpiration = getCurrentTime();
	var previouslyAnnounced = false;  // NOTE: Seems will always be false.

	var immediateAlert = false;

	var newRecord = false;

	for (var deviceCounter=0; deviceCounter<networkDevices.length; deviceCounter++)
	{
		if (networkDevices[deviceCounter][0] == mac)
		{
			if (debug) console.log ("\n***************** " + getCurrentTime() + " -- UPDATE DEVICE -- **************");

			recordNumber = deviceCounter;
			newRecord = false;

			whiteListDeviceFlag = networkDevices[deviceCounter][3];
			alertDeviceFlag = networkDevices[deviceCounter][4];

			if (alertDeviceFlag && state == "down" && state != getDeviceState(recordNumber))
			{
				// set the "previously announced" flag to false, because the state has changed
				previouslyAnnounced = false;

				alertIndex = getAlertIndex(deviceCounter);

				alertExpiration = getNewAlertTimeoutExpriation(alertIndex);
			}
			else if (alertDeviceFlag && state == "up")
			{
				previouslyAnnounced = true;
				immediateAlert = true;
			}
		}
	}

	if (recordNumber == -1)
	{
		if (debug) console.log ("\n***************** " + getCurrentTime() + " -- NEW DEVICE -- **************");

		newRecord = true;
		recordNumber = networkDevices.length;
	}

	networkDevices[recordNumber] = [mac, state, ip_address, whiteListDeviceFlag, alertDeviceFlag, manufacturer, fingTimestamp, previouslyAnnounced, alertExpiration, false, fqdn];
	
	// For new devices, we need to check if the device is an "Alert Device", only for new devices
	if (newRecord)
	{
		alertIndex = getAlertIndex(recordNumber);
		whiteListIndex = getWhiteListIndex(recordNumber);

		if (alertIndex >= 0)
		{
			alertDeviceFlag = true;
			networkDevices[recordNumber][4] = alertDeviceFlag;
			previouslyAnnounced = true; // Doesn't really matter, but setting this to be consistant

			immediateAlert = true;
		}

		if (whiteListIndex >= 0)
		{
			whiteListDeviceFlag = true;
			networkDevices[recordNumber][3] = whiteListDeviceFlag;
		}
	}

	if (immediateAlert) alertDevice(recordNumber);

	logToConsole(recordNumber);
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

		if (isAlertDevice(deviceIndex)) console.log("\t\tAlert Device: " + alertDevices[alertIndex][0]);
		if (isWhiteListedDevice(deviceIndex)) console.log("\t\tWhite List Device: " + whiteListDevices[whiteListIndex][0]);

		console.log("\t\tFing last update timestamp: " + getFingTimestamp(deviceIndex));
		console.log("\t\t\"Off network\" Expiration Time: " + getExpirationTime(deviceIndex));
		console.log("\t\tPreviously Announced: " + wasPreviouslyAnnouced(deviceIndex));
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

function getDeviceState(deviceIndex)
{
	return networkDevices[deviceIndex][1];
}

function isReadyforAlert(deviceIndex) {
	var alertIndex = getAlertIndex(deviceIndex);

	// if it's not a device that needs to be announced (alert flag is false)	
	if (!isAlertDevice(deviceIndex)) {
		return false;
	}
	else if (wasPreviouslyAnnouced(deviceIndex))
	{
		console.log("** (" + getCurrentTime() + ") Not going to send an alert for device " + alertDevices[alertIndex][0] + " because it was already announced");
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

	if (getDeviceState(deviceIndex) == "up")
	{
		setValue = "true"
	}
	else if (getDeviceState(deviceIndex) == "down")
	{
		setValue = "false"
	}

	// set the "Announced device" flag to true (for the current state)
	networkDevices[deviceIndex][7] = true;

	console.log("** (" + getCurrentTime() + ") ALERT ** Alert being sent for device - " + alertDevices[alertIndex][0] + ": State is " + setValue);
	exec("curl -X PUT -d value=" + setValue + " " + alertDevices[alertIndex][3] + "> /dev/null 2>&1", function(error, stdout, stderr){});	

}

function isWhiteListedDevice(deviceIndex)
{
	return (networkDevices[deviceIndex][3]);
}

function wasPreviouslyReported(deviceIndex)
{
	return (networkDevices[deviceIndex][9]);
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

	networkDevices[deviceIndex][9] = true;
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
	return (networkDevices[deviceIndex][8]);
}

function wasPreviouslyAnnouced(deviceIndex) {
	return (networkDevices[deviceIndex][7]);
}

function getFQDN(deviceIndex) {
	return (networkDevices[deviceIndex][10]);
}


function processDevices() {
	/*
		[0] = Mac Address
		[1] = State
		[2] = IP Address
		[3] = White Listed (true or false)
		[4] = Alert Device (true or false)
		[5] = Manufacturer
		[6] = Fing Timestamp
		[7] = Previously Announced
		[8] = Timeout expiration for declaring "off" network
		[9] = Previously Reported (for non-whitelisted devices)
		[10] = Fully qualified domain name
	*/
	
	if (debug)
	{
		console.log ("\n***************** " + getCurrentTime() + " -- Processing the list of known devices -- **************");
		console.log ("\tNumber of devices I am aware of: " + networkDevices.length);
	}

	for (var deviceCounter=0; deviceCounter<networkDevices.length; deviceCounter++)
	{
		if (isAlertDevice(deviceCounter))
		{
			logToConsole(deviceCounter);
		}

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