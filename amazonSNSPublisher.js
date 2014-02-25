
function AmazonSNSPublisher() {
	var _self = this;
	var _aws = require('aws-sdk');
	var _util = require('util');
	var _moment = require('moment');
	var _topicARN;
	var _aws_sns;
	var _dateformat = "YYYY/MM/DD HH:mm:ss";

	this.configureAWSCredentials = function(region, accessKeyId, secretAccessKey) {
		// configure AWS 
		_aws.config.update({
			'region': region,
		    'accessKeyId': accessKeyId,
		    'secretAccessKey': secretAccessKey
		});

		_aws_sns = new _aws.SNS({sslEnabled: true}).client;
	}

	this.publish = function(topic, message) {
		_aws_sns.publish({
		    'TopicArn': topic,
		    'Message': message,
		}, function (err, result) {
		 
		    if (err !== null) {
				console.log("** (" + _self._getCurrentTime() + ") SNS ERROR: ");
				console.log(_util.inspect(err));
				return;
		    }
				console.log("** (" + _self._getCurrentTime() + ") Amazon message publish was sucessful");
//				console.log(result);
		});
	}

	this._getCurrentTime = function() {
		return (_moment().format(_dateformat));
	}
}

module.exports = AmazonSNSPublisher;