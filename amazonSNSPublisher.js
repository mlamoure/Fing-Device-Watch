var aws = require('aws-sdk');
var util = require('util');
var moment = require('moment');

function AmazonSNSPublisher() {
	var _self = this;
	var _topicARN;
	var _aws_sns;
	var _dateformat = "YYYY/MM/DD HH:mm:ss";

	this.configureAWSCredentials = function(region, accessKeyId, secretAccessKey) {
		// configure AWS 
		aws.config.update({
			'region': region,
		    'accessKeyId': accessKeyId,
		    'secretAccessKey': secretAccessKey
		});

		_aws_sns = new aws.SNS({sslEnabled: true}).client;
	}

	this.publish = function(topic, message) {
		_aws_sns.publish({
		    'TopicArn': topic,
		    'Message': message,
		}, function (err, result) {
		 
		    if (err !== null) {
				console.log("** (" + _self._getCurrentTime() + ") SNS ERROR: ");
				console.log(util.inspect(err));
				return;
		    }
				console.log("** (" + _self._getCurrentTime() + ") Amazon message publish was sucessful");
//				console.log(result);
		});
	}

	this.subscribeSNSTopic = function(topic, endpointURL) {	 
		_aws_sns.subscribe({
		    'TopicArn': topic,
		    'Protocol': 'http',
		    'Endpoint': endpointURL
		}, function (err, result) {
		 
		    if (err !== null) {
				console.log("** (" + getCurrentTime() + ") Error:");
		        console.log(util.inspect(err));
		        return;
		    }
			console.log("** (" + _self._getCurrentTime() + ") Sent a subscription request for topic " + topic + " and Amazon responded with:");
			console.log(result);
		});
	}

	this.confirmSubscription = function(topic, token, callback) {
		_aws_sns.confirmSubscription({
		    'TopicArn': topic,
		    'Token': token,
		}, function (err, result) {
		 
		    if (err !== null) {
				console.log("** (" + _self._getCurrentTime() + ") ERROR: ");
				console.log(util.inspect(err));
				return;
		    }

			console.log("** (" + _self._getCurrentTime() + ") Responded with a Confirmation for topic " + topic + " and recieved SubscriptionARN: " + result.SubscriptionArn);

			if (callback != null) {
				callback(result.SubscriptionArn);
			}
		});		
	}

	this.unSubscribeSNSTopic = function(subscriptionArn, callback) {	 
		_aws_sns.unsubscribe({
		    'SubscriptionArn': subscriptionArn
		}, function (err, result) {
		 
		    if (err !== null) {
				console.log("** (" + _self._getCurrentTime() + ") Error:");
		        console.log(util.inspect(err));
		        return;
		    }
			console.log("** (" + _self._getCurrentTime() + ") Sent a unsubscription request for SubscriptionArn " + subscriptionArn + " and Amazon responded with:");
			console.log(result);

			if (callback != null) callback(subscriptionArn);
		});
	}

	this._getCurrentTime = function() {
		return (moment().format(_dateformat));
	}
}

module.exports = AmazonSNSPublisher;