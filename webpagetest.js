Results = new Mongo.Collection('results');

getResult = function (testID) {
  HTTP.get('http://www.webpagetest.org/jsonResult.php', {params: {test: testID}}, function (error, result) {
    // body...
    if (!error) {
      var response = result.data;
      var browser_name = response.data.runs[1] ? response.data.runs[1].firstView.browser_name : 'none';
      var browser_version = response.data.runs[1] ? response.data.runs[1].firstView.browser_version : 'none';
      Results.upsert({ url: response.data.url, id: response.data.id }, { url: response.data.url, id: response.data.id, connectivity: response.data.connectivity, browser_name: browser_name, browser_version: browser_version, date: new Date() });
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
              response.push({ id: result.id, connectivity: result.connectivity, browser_name: result.browser_name, browser_version: result.browser_version, date: result.date });
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

Router.route('resetOutstandingCount', {
        path: '/api/resetOutstanding',
        where: 'server',
        action: function() {
            outstandingRequests = 0;
            this.response.end(JSON.stringify(domains));
        }
    }
);


Router.route('addDomain', {
        path: '/api/addDomain',
        where: 'server',
        action: function() {
            if (outstandingRequests > 0) {
              outstandingRequests--;
            }
            this.response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*'});
            getResult(this.params.query.id);
            this.response.end('thank you');
        }
    }
);

Router.route('/', {
    // options for the route
});

if (Meteor.isServer) {
  Accounts.config({sendVerificationEmail: true, forbidClientAccountCreation: false});
}

if (Meteor.isClient) {
  Meteor.startup(function() {
    setInterval(function() {
      Meteor.call('requests', function(error, value) {
        console.log('timeout',value);
        outstandingCounter.set(value);
      });
    }, 10000);
  })
  var outstandingCounter = new ReactiveVar(0);
  Template.body.events({
    'click #button': function(e){
      var domainChoice = document.getElementById('domain').value;

      var locationChoice = document.getElementById('location').value;
      var locations = [];
      if (locationChoice == '_release_') {
        locations = Meteor.settings.public.locations.slice(0,2);
      } else if (locationChoice == '_nightly_') {
        locations = Meteor.settings.public.locations.slice(-2);
      } else if (locationChoice == '_all_') {
        locations = Meteor.settings.public.locations;
      } else {
        locations = [ locationChoice ];
      }

      var countChoice = document.getElementById('count').value;


      Meteor.call('submitTask', domainChoice, locations, countChoice, function (error, result) {
        if (!error) {
          alert('Triggered '+result+' tests');
        } else {
          alert(error);
        }
      });
    }
  });

  Template.submitForm.helpers({
    locations: Meteor.settings.public.locations
  });

  Template.outstanding.helpers({
    requests: function() {
      return outstandingCounter.get();
    }
  });

}


if (Meteor.isServer) {
  var top100 = [];
  var outstandingRequests = 0;

  Meteor.startup(function () {
    top100 = JSON.parse(Assets.getText('top100.json'));
  });

  function requestDomain(domain, location) {
    var params = {
            'k': Meteor.settings.key,
            'location': location,
            'url': domain,
            'f': 'json',
            'runs': 10,
            'pingback': Meteor.settings.pingback
          }
    return HTTP.get('http://localhost', { params: params });
  }

  function requestAll(targetDomain, locations, count) {
    var domains = [];
    if (targetDomain == '*') {
      domains = top100;
    } else {
      domains.push(targetDomain);
    }

    if (count > 100) {
      count = 100;
    }

    var results = [];
    for (var domain of domains) {
      for (var i = 0; i < count; i++) {
        for (var location of locations) {
          var r = requestDomain(domain, location);
          results.push(r);
        }
      }
    }

    return results;
  }

  Meteor.methods({
      'submitTask': function(domain, locations, count) {
          console.log(domain,locations,count);

          var domainCount = 1;
          if (domain == '*') {
            domainCount = top100.length;
          }
          if (count * locations.length * domainCount + outstandingRequests > 10000) {
            throw new Meteor.Error(400, 'The number of outstanding tests is too large. Please wait.');
          }

          var currentUserId = Meteor.userId();
          var user = Meteor.users.find({ _id: currentUserId}).fetch()[0];
          var email = user.emails[0];

          // Only allow verified emails from mozilla.com
          if (!email.address.endsWith('@mozilla.com')) {
            throw new Meteor.Error(403, 'You must have a verified @mozilla.com email address.');
          }
          if (!email.verified) {
            throw new Meteor.Error(403, 'Your email address isn\' verified. Check your inbox.');
          }

          var r = requestAll(domain, locations, count);
          outstandingRequests += r.length;
          return r.length;
      },
      'requests': function() {
        return outstandingRequests;
      }
  });
}

