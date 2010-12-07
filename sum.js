/*
Copyright (c) 2010, Liu Liu
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
* Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
* Neither the name of the authors nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
if (parallable === undefined) {
	var parallable = function (file, funct) {
		/* if by any chance, JS engine embeded a hash implementation (MD5 or SHA1), I can get rid of the funct.toString() as key,
		 * but for now, it is hard to copy several hundreds lines of code in the tiny snippet */
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
				/* support named argument */
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
				return function (complete, error) {
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
