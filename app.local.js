'use strict'
const app = require('./app')

let port = process.env.PORT || 5000;
app.listen(port, function () {
  console.log('Example app listening on port ' + port);
});
