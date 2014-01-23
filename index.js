var cluster = require('cluster');
var os = require('os');
var fs = require('fs');
var logger = require('logger');

var Reload = function(master, worker) {
    if (!worker) {
        worker = master;
        master = null;
    }
    this.master = master;
    this.worker = worker;
};

Reload.prototype.run = function(numWorkers, pidPath) {
    if (!numWorkers) {
        numWorkers = os.cpus().length;
    }

    if (cluster.isMaster) {
        var fork = function(old) {
            var worker = cluster.fork();

            worker.once('exit', function() {
                setTimeout(fork, 1000);
            });

            worker.once('listening', function() {
                if (old) {
                    old.removeAllListeners('exit');
                    old.send('shutdown');
                    old.disconnect();

                    var timer = setTimeout(function() {
                        logger.warn('worker: ' + old.process.pid + ' timeout');
                        old.kill();
                    }, 60000);

                    old.once('disconnect', function() {
                        clearTimeout(timer);
                    });
                }
            });
        };

        for (var i = 0; i < numWorkers; i++) {
            fork();
        }

        cluster.on('exit', function(worker, code, signal) {
            logger.info('worker: ' + worker.process.pid + ' exit');
        });

        cluster.on('disconnect', function(worker) {
            logger.info('worker: ' + worker.process.pid + ' disconnect');
        });

        cluster.on('listening', function(worker) {
            logger.info('worker: ' + worker.process.pid + ' listening');
        });

        process.on('SIGHUP', function() {
            logger.info('worker: reload');

            for (var id in cluster.workers) {
                fork(cluster.workers[id]);
            }
        });

        process.on('uncaughtException', function(error) {
            logger.crit(error);
        });

        if (pidPath) {
            fs.writeFileSync(pidPath, process.pid);
        }

        if (this.master) {
            this.master(cluster);
        }
    } else {
        this.worker(cluster);
    }
};

module.exports.createWorker = function(master, worker) {
    return new Reload(master, worker);
};
