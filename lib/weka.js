const remove = require("./IO").remove;

var exec = require("sdk/system/child_process").exec;
var child;

var async = require('./async');

/**
 * Build tranings set and classify the test item.
 * @param weka_path
 * @param training_dataset_path
 * @param test_dataset Data in ARFF js format (ArffData)
 * @param options Parameter for the classifier
 * @param cb Callback function
 */
module.exports.classify = function (weka_path, training_dataset_path, test_dataset, options, cb) {

    async.waterfall([
        function (callback) {
            test_dataset.toNewArffFile(callback);
        },
        function (fileIdTest, callback) {

//      console.log('weka ' + options.classifier + ' '
//        + options.params +
//        ' -t ' + fileIdTraining +
//        ' -T ' + fileIdTest +
//        ' -no-cv -v -p 0');
//                                        ../bin/weka.jar
            var cmd_line = 'java -classpath ' + weka_path + ' ' + options.classifier + ' '
                + options.params +
                ' -T ' + fileIdTest +
                ' -t ' + training_dataset_path +
                ' -no-cv -v -p 0';
            child = exec(cmd_line, function (error, stdout, stderr) {

                if (error) {
                    callback(error);
                    return;
                }
                var result = {};

                var splitted = getResultFromStdout(stdout);

                result.predicted = splitted[2].split(':')[1];
                result.prediction = splitted[splitted.length - 1];

                remove(fileIdTest).then(()=> {
                    console.log("Removed file at location: \"" + fileIdTest + "\"");
                }, (e)=> {
                    console.log(e);
                });

                callback(error, result);

            });
        }
    ], function (err, result) {
        cb(err, result);
    });
};

/**
 * Parse the stdout to take result
 * @param stdout
 * @returns {Array}
 */
function getResultFromStdout(stdout) {
    var ret = stdout.split('\n')[5].trim().split(' ');
    for (let i = 0; i < ret.length;) {
        if (ret[i] === '')
            ret.splice(i, 1);
        else
            i++
    }
    return ret;
}
