const express = require('express');
const router = express.Router();

router.get('/', (req, res, next) => {
  console.log("first")
  res.status(200).json({
    message: 'The server is alive',
  });
});

module.exports = router;
