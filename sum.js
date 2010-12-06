if (parallable === undefined) {
	var parallable = function (file, funct) {
		parallable.core[funct.toString()] = funct().core;
		return function () {
			var i;
			var async, worker_num, params;
			if (arguments.length > 1) {
				async = arguments[arguments.length - 2];
				worker_num = arguments[arguments.length - 1];
				params = new Array(arguments.length - 2);
				for (i = 0; i < arguments.length - 2; i++)
					params[i] = arguments[i];
			} else {
				async = arguments[0].async;
				worker_num = arguments[0].worker;
				params = arguments[0];
				delete params["async"];
				delete params["worker"];
				params = [params];
			}
			var scope = { "shared" : {} };
			var ctrl = funct.apply(scope, params);
			if (async) {
				var executed = 0;
				var outputs = new Array(worker_num);
				var inputs = ctrl.pre.apply(scope, [worker_num]);
				/* sanitize scope shared because for Chrome/WebKit, worker only support JSONable data */
				for (i in scope.shared)
					/* delete function, if any */
					if (typeof scope.shared[i] == "function")
						delete scope.shared[i];
					/* delete DOM object, if any */
					else if (scope.shared[i].tagName !== undefined)
						delete scope.shared[i];
				return function (complete, error) {
					for (i = 0; i < worker_num; i++) {
						var worker = new Worker(file);
						worker.onmessage = (function (i) {
							return function (event) {
								outputs[i] = (typeof event.data == "string") ? JSON.parse(event.data) : event.data;
								executed++;
								if (executed == worker_num)
									complete(ctrl.post.apply(scope, [outputs]));
							}
						})(i);
						var msg = { "input" : inputs[i],
									"name" : funct.toString(),
									"shared" : scope.shared,
									"id" : i,
									"worker" : params.worker_num };
						try {
							worker.postMessage(msg);
						} catch (e) {
							worker.postMessage(JSON.stringify(msg));
						}
					}
				}
			} else {
				return ctrl.post.apply(scope, [[ctrl.core.apply(scope, [ctrl.pre.apply(scope, [1])[0], 0, 1])]]);
			}
		}
	};
	parallable.core = {};
}

var sum = parallable("sum.js", function (list) {
		if (this.shared !== undefined) {
			this.shared.list = list;
		}
		var pre = function (worker_num) {
			var list = this.shared.list;
			var part = new Array(worker_num);
			var i;
			var len = Math.ceil(list.length / worker_num);
			for (i = 0; i < worker_num; i++)
				part[i] = new Array(len);
			for (i = 0; i < list.length; i++)
				part[Math.floor(i / len)][i % len] = list[i];
			return part;
		};
		var core = function (data, id, worker_num) {
			var i, j;
			var sum = 0;
			for (i = 0; i < data.length; i++)
				for (j = 0; j < 5000; j++)
					sum += Math.cos(Math.sin(data[i]));
			return sum;
		};
		var post = function (seq) {
			var i;
			var sum = 0;
			for (i = 0; i < seq.length; i++)
				sum += seq[i];
			return sum;
		};
		return { "pre" : pre, "core" : core, "post" : post };
});

onmessage = function (event) {
	var data = (typeof event.data == "string") ? JSON.parse(event.data) : event.data;
	var scope = { "shared" : data.shared };
	var result = parallable.core[data.name].apply(scope, [data.input, data.id, data.worker]);
	try {
		postMessage(result);
	} catch (e) {
		postMessage(JSON.stringify(result));
	}
}
