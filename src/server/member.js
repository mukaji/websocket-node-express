
/* db configuration */
var mysql = require('mysql')
var fs = require('fs');
var configPath = './config.json';
var parsed = JSON.parse(fs.readFileSync(configPath, 'UTF-8'));
exports.storageConfig = parsed;
const dbhost = exports.storageConfig.mysql.dbhost;
const dbuser = exports.storageConfig.mysql.dbuser;
const dbpassword = exports.storageConfig.mysql.dbpassword;
const dbschema = exports.storageConfig.mysql.dbschema;


module.exports = {

    memberSignUp: function (email, password, res) {
        return signUp(email, password, res);
    },
    memberLogin:  function (email, password, res) {
        return logIn(email,password,res);
    }
}
function logIn(email, password, res) {
    var parameters=[email,password];
    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    }); 
    connection.connect()
    var sql = ' select email from member where email=? and password=? ';
    connection.query(sql, parameters, function (err, rows) {
        if (err) {
            console.log("ERROR logIn:" + err.message);
        } else {
            if (rows.length == 0) {
                console.log("Invalid email or password");
                res.send("ERROR:Invalid email or password");
            } else {  
                console.log("login ok");
                res.send("SUCCESS");
            }
        }
    })

    connection.end()
}
function signUp(email, password, res) {

    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    }); 
    connection.connect()
    var sql = ' select email from member where email=? ';
    connection.query(sql, email, function (err, rows) {
        if (err) {
            console.log("ERROR signUp:" + err.message);
        } else {
            if (rows.length == 0) {
                //insert db
                insertMember(email, password,res);  
            } else {  
                res.send("ERROR:Email is already exist");
            }
        }
    })

    connection.end()


}


function insertMember(email, password,res) {
    var parameters = [email, password];
    var connection = mysql.createConnection({
        host: dbhost,
        user: dbuser,
        password: dbpassword,
        database: dbschema
    });

    connection.connect()
    var sql = ' insert into member(id,email,password,memberstatuscode,createddate) values(uuid(),?,?,0,now()) ';
    connection.query(sql, parameters, function (err, rows) {
        if (err) {
            console.log("ERROR insertMember:" + err.message);
            res.send("ERROR:" + err.message);
        } else {
            console.log("INSERT MEMBER SUCCESS email="+email);
            res.send("SUCCESS");
        }
    })

    connection.end()

}