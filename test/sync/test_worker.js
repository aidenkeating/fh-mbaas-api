var assert = require('assert');
var sinon = require('sinon');
var Worker = require('../../lib/sync/worker');
var metricsKeys = require('../../lib/sync/sync-metrics').KEYS;

var processor = function(task, finish) {
  task.processed = true;
  setTimeout(finish, 0);
};

var counters = {};
var metrics = {
  inc: function(key) {
    if (counters[key]) {
      counters[key]++;
    } else {
      counters[key] = 1;
    }
  },
  gauge: function(){}
};

module.exports = {
  'test_queue_worker': function(done) {
    var q = {
      get: sinon.stub(),
      ack: sinon.stub(),
      size: sinon.spy()
    };
    var task1 = {id: 1};
    var task2 = {id: 2};
    q.get.onFirstCall().yields(null, task1);
    q.get.onSecondCall().yields(new Error('test error'));
    q.get.onThirdCall().yields(null, null);
    q.get.onCall(3).yields(null, task2);
    q.ack.yields(new Error('test ack failed'));
    var worker = new Worker(q, processor, metrics, {interval: 10, backoff: {strategy: 'none'}});
    worker.work();
    setTimeout(function(){
      assert.ok(worker.statsCollector);
      assert.ok(q.get.callCount >= 4);
      assert.equal(q.ack.callCount, 2);
      assert.ok(task1.processed);
      assert.ok(task2.processed);
      assert.equal(counters[metricsKeys.WORKER_JOB_TOTAL_COUNT], 2);
      assert.equal(counters[metricsKeys.WORKER_JOB_ERROR_COUNT], 1);
      assert.equal(counters[metricsKeys.WORKER_JOB_SUCCESS_COUNT], 2);
      assert.equal(counters[metricsKeys.WORKER_JOB_FAILURE_COUNT], undefined);
      done();
    }, 50);
  },
  'test_queue_worker stop': function(done) {
    var q = {
      get: sinon.stub(),
      ack: sinon.stub(),
      size: sinon.spy()
    };
    var task1 = {id: 1};
    q.get.onFirstCall().yields(null, task1);
    var worker = new Worker(q, processor, metrics, {interval: 50});
    worker.work();
    setTimeout(function(){
      worker.stop();
      setTimeout(function(){
        assert.ok(q.get.calledOnce);
        done();
      }, 20);
    }, 40)
  },
  'test_queue_worker backoff using exponential strategy': function(done) {
    var q = {
      get: sinon.stub(),
      ack: sinon.stub(),
      size: sinon.spy()
    };
    q.get.yields(null, null);
    var worker = new Worker(q, processor, metrics, {interval: 10, backoff: {strategy: 'exp'}});
    worker.work();
    setTimeout(function(){
      assert.equal(q.get.callCount, 3);
      done();
    }, 50);
  },
  'test_queue_worker turn off backoff': function(done) {
    var q = {
      get: sinon.stub(),
      ack: sinon.stub(),
      size: sinon.spy()
    };
    q.get.yields(null, null);
    var worker = new Worker(q, processor, metrics, {interval: 10, backoff: {strategy: 'none'}});
    worker.work();
    setTimeout(function(){
      assert.ok(q.get.callCount >=4 );
      done();
    }, 50);
  }
};