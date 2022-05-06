if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config() //Loads in all the environment variables
}

const express = require('express')
const path = require('path')
const mysql = require('mysql2/promise')
const bcrypt = require('bcryptjs')
const passport = require('passport')
const flash = require('express-flash')
const session = require('express-session')
const methodOverride = require('method-override')
const initializePassport = require('./passport-config')
// Initialize the passport
initializePassport(
  passport, // Passport object
  getUserByEmail, // A function that gets the user by email (unique identifier for user)
  getUserById // A function that gets the user by id (HIDDEN unique identifier)
)

const app = express()
const port = 3000

// Tells our app that we want to use ejs as a view engine
app.set('view engine', 'ejs');

// Tells our app to take the forms and access them from the request object
app.use(express.urlencoded({
  extended: false
}))

// Tells our app to use flash and session (these are helper modules for authentication) 
app.use(flash())
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}))

// Tells our app to use some authentication functions
app.use(passport.initialize())
app.use(passport.session())

// Tells our app to override some methods, so we can execute delete requests as POST instead from the HTML
app.use(methodOverride('_method'))

// Connection info should be obtained using a .env
const pool = mysql.createPool({
  connectionLimit: 10,
  host: 'bonfire-1.cdrbnm7ck3cj.us-east-2.rds.amazonaws.com',
  user: 'admin',
  password: 'Rocco123',
  database: 'bonfire'
})

// Connects to the database and adds a new user entry
function addNewUser(username, email, encrypted_password, isAdmin) {
  var sql = `INSERT INTO users (username, email, upvotes_received, upvotes_given, encrypted_password, is_admin) values
  ('${username}', '${email}','0', '0', '${encrypted_password}', ${isAdmin});`;
  pool.query(sql);
}

// Checks if an email is in the database
// Returns an object representing a user, or null
async function getUserByEmail(email) {
  var sql = `SELECT * FROM users WHERE email='${email}'`;
  let [rows, fields] = await pool.execute(sql, [1, 1]);
  let row = rows[0]
  if (row) {
    return {
      user_id: row.user_id,
      username: row.username,
      email: row.email,
      upvotes_received: row.upvotes_received,
      upvotes_given: row.upvotes_given,
      encrypted_password: row.encrypted_password,
      is_admin: row.is_admin,
    }
  } else {
    return null
  }
}

// Checks if an id is in the database
// Returns an object representing a user or null
async function getUserById(id) {
  var sql = `SELECT * FROM users WHERE user_id='${id}'`;
  let [rows, fields] = await pool.execute(sql, [1, 1]);
  let row = rows[0]
  if (row) {
    return {
      user_id: row.user_id,
      username: row.username,
      email: row.email,
      upvotes_received: row.upvotes_received,
      upvotes_given: row.upvotes_given,
      encrypted_password: row.encrypted_password,
      is_admin: row.is_admin,
    }
  } else {
    return null
  }
}

async function deleteUserById(id) {
  var sql = `DELETE FROM users WHERE user_id='${id}'`;
  await pool.execute(sql, [1, 1]);
}

deleteUserById(2);

// GET landing page. Currently it gets all the users from the database, for debugging purposes.
app.get('/', checkAuthenticated, (req, res) => {
  getAllUsers().then(function ([rows, fields]) {
    res.render('pages/index', {
      query: rows,
      username: req.user.username
    });
  })
})

// GET login page
app.get('/login', checkNotAuthenticated, (req, res) => {
  res.render('pages/login')
})

// POST login page
app.post('/login', checkNotAuthenticated, passport.authenticate('local', {
  successRedirect: '/',
  failureRedirect: '/login',
  failureFlash: true
}))

// GET admin dashboard page
app.get('/admin', checkIfAdminAndAuthenticated, (req, res) => {
  getAllUsers().then(function ([rows, fields]) {
    res.render('pages/admin', {
      is_admin: req.user.is_admin,
      username: req.user.username,
      users: rows
    });
  })
})

app.delete('/admin', (req, res) => {
  deleteUser(req.id_to_delete).then(function() {
    res.render('pages/admin', {
      is_admin: req.user.is_admin,
      username: req.user.username,
      users: rows
    })
  })
})

// GET registration page
app.get('/register', checkNotAuthenticated, (req, res) => {
  res.render('pages/register');
})

// POST login page
app.post('/register', checkNotAuthenticated, async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10)
    let isAdmin = req.body.email.split("@")[1].includes("admin")
    addNewUser(req.body.username, req.body.email, hashedPassword, isAdmin)
    res.redirect('/login') // Redirect to login page on success
  } catch (err) {
    console.log(err)
    res.redirect('/register') // Return to registration page on failure
  }
})

// Logout route. Can be hit using a POST
app.delete('/logout', (req, res) => {
  req.logOut() // This function is set up by passport automatically, clears session and logs user out
  res.redirect('/login')
})

// Middleware function to check if user is authenticated
function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next() //everything works, just execute the next function
  }
  res.redirect('/login')
}

// Middleware function to check if user is NOT authenticated
function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.redirect('/') // If authenticated, redirect them to dashboard
  }
  next() // if not authenticated, continue execution
}

// Middleware function to check if user is NOT authenticated
function checkIfAdminAndAuthenticated(req, res, next) {
  if (req.isAuthenticated() && req.user.is_admin) {
    return next() // If authenticated, redirect them to dashboard
  }
  return res.redirect('/') // if not authenticated, continue execution
}

// Gets all the users from the database. Returns a weird SQL object thingy.
async function getAllUsers() {
  let [rows, fields] = await pool.execute('SELECT * FROM users', [1, 1]);
  return [rows, fields];
}

// Tells our app to listen to a certain port
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})

// Connects to the database (service) and creates a database
// This function is commented out, because it CANNOT be used with mysql connection pools
// function createDatabase() {
//   var sql = `CREATE DATABASE bonfire;`;
//   connection.connect(function(err) {
//     if (err) throw err;
//     console.log("Connected at createDB.");
//     connection.query(sql, function (err, result) {
//       if (err) throw err;
//       console.log("Database bonfire created.");
//     });
//   })
// }

// Connects to the database and creates a user table
// This function is commented out, because it CANNOT be used with mysql connection pools
// function createUserTable() {
//   var sql = `CREATE TABLE users (user_id BIGINT NOT NULL AUTO_INCREMENT, username VARCHAR(31) NOT NULL, email VARCHAR(255), upvotes_received BIGINT, upvotes_given BIGINT, encrypted_password VARCHAR(255) NOT NULL, is_admin BOOLEAN NOT NULL, PRIMARY KEY (user_id))`;
//   connection.connect(function(err) {
//     if (err) throw err;
//     console.log("Connected at createUserTable.");
//     connection.query(sql, function (err, result) {
//       if (err) throw err;
//       console.log("TABLE users created.");
//     });
//   })
// }

// Connects to the database and drops the user table
// This function is commented out, because it CANNOT be used with mysql connection pools
// function dropUserTable() {
//   var sql = `DROP TABLE users`
//     connection.connect(function(err) {
//     if (err) throw err;
//     console.log("Connected at createUserTable.");
//     connection.query(sql, function (err, result) {
//       if (err) throw err;
//       console.log("TABLE users dropped.");
//     });
//   })
// }

// Connects to the database and modifies the user table
// This function is commented out, because it CANNOT be used with mysql connection pools
// function modifyUserTable() {
//   var sql = `ALTER TABLE users
//   DROP COLUMN fullname;`;
//   connection.connect(function(err) {
//     if (err) throw err;
//     console.log("Connected at createUserTable.");
//     connection.query(sql, function (err, result) {
//       if (err) throw err;
//       console.log("TABLE users modified.");
//     });
//   })
// }