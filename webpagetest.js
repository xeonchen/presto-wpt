Results = new Mongo.Collection("results");

getResult = function (testID) {
  HTTP.get("http://www.webpagetest.org/jsonResult.php", {params: {test: testID}}, function (error, result) {
    // body...
    if (!error) {
      // console.log(result.data);
      var response = result.data;
      var browser_name = response.data.runs[1] ? response.data.runs[1].firstView.browser_name : "none";
      var browser_version = response.data.runs[1] ? response.data.runs[1].firstView.browser_version : "none";
      Results.upsert({ url: response.data.url, id: response.data.id }, { url: response.data.url, id: response.data.id, connectivity: response.data.connectivity, browser_name: browser_name, browser_version: browser_version });
      console.log(response.data.id);
    }
  });
}

Router.route('getResultsForDomain', {
        path: '/api/get/:domain',
        where: 'server',
        action: function() {
            this.response.writeHead(200, {'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*'});


            var response = [];
            var results = Results.find({url: decodeURIComponent(this.params.domain)}, {sort: {browser_name: 1}}).fetch();
            console.log(this.params.domain);
            console.log(results.length);
            for (var i in results) {
              var result = results[i];
              response.push({ id: result.id, connectivity: result.connectivity, browser_name: result.browser_name, browser_version: result.browser_version});
            }

            this.response.end(JSON.stringify(response));
        }
    }
);

Router.route('all', {
        path: '/api/all',
        where: 'server',
        action: function() {
            this.response.writeHead(200, {'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*'});


            var response = [];
            var results = Results.find({}, {sort: {browser_name: 1}}).fetch();
            for (var i in results) {
              var result = results[i];
              response.push({ id: result.id, connectivity: result.connectivity, browser_name: result.browser_name, browser_version: result.browser_version});
            }

            this.response.end(JSON.stringify(response));
        }
    }
);

Router.route('getDomains', {
        path: '/api/domains',
        where: 'server',
        action: function() {
            this.response.writeHead(200, {'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*'});

            var domains = [];
            var results = Results.find({}, {sort: {url: 1}}).fetch();

            if (results.length > 0)
              domains.push(results[0].url);

            for (var i = 1; i < results.length; i++) {
              if (results[i].url == results[i-1].url) {
                continue;
              }
              domains.push(results[i].url);
            }

            this.response.end(JSON.stringify(domains));
        }
    }
);

Router.route('addDomain', {
        path: '/api/addDomain',
        where: 'server',
        action: function() {
            this.response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*'});
            getResult(this.params.query.id);
            this.response.end("thank you");
        }
    }
);

Router.route('/', {
    // options for the route
});
