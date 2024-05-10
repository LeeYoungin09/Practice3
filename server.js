require('dotenv').config();

const express = require('express');
const app = express();
const port = process.env.PORT;

app.set('view engine', 'ejs');
app.use(express.static('public'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const { MongoClient } = require('mongodb');
const url = process.env.MONGO_URL;
const client = new MongoClient(url);

const fs = require('fs');
const uploadDir = 'public/uploads/';

const multer = require('multer');
const path = require('path');

const methodOverride = require('method-override');
app.use(methodOverride('_method'));

/* jsonwebtoken */
// 로그인 성공하면 세션키(인증토큰)발행
// 사용자의 세션을 식별하거나 사용자의 인증 상태를 유지하는 데 사용, 일시적으로만 유효
const jwt = require('jsonwebtoken');
const SECRET = process.env.SECRET_KEY;

const cookieParser = require('cookie-parser');
app.use(cookieParser());

//모든 요청사항
app.use(async (req, res, next) => {
  const token = req.cookies.token;
  if (token) {
    //true값 = 로그인됨
    try {
      const data = jwt.verify(token, SECRET);
      const db = await getDB();
      const user = await db
        .collection('users')
        .findOne({ userid: data.userid });
      req.user = user ? user : null;
    } catch (e) {
      console.error(e);
    }
  }
  next();
});

// cookie-parser
// 쿠키피싱
// 쿠키 생성 및 삭제
// 쿠키를 데이터에 저장

// const { error, log } = require('console');

// 업로드 디렉터가 없을 경우 새로 업로드디렉터를 만들라는 코드
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const getDB = async () => {
  await client.connect();
  return client.db('Blog');
};

app.get('/', async (req, res) => {
  // const user = req.user ? req.user : null;
  try {
    const db = await getDB();
    const posts = await db
      .collection('posts')
      .find()
      .sort({ createAtDate: -1 })
      .toArray();
    console.log(posts);
    res.render('index', { posts, user: req.user }); // [posts:posts 축약버전] +★user 정보 추가
    // req.user = req.user ? req.user : null;
  } catch (error) {
    console.log(error);
  }
});

//3개씩 추가되는 블로그글 가져오는 기능
// app.get('/getPosts', async(req,res)=>{
//   const page = req.query.page || 1
//   // const postsPerPage = req.query.postsPerPage || 3
//   const postsPerPage = 3
//   const skip = 3 + (page - 1) * postsPerPage
//   try {
//     const db = await getDB()
//     const posts = await db.collection('posts').find().sort({createAtDate:-1}).skip(skip).limit(postsPerPage).toArray()
//     res.json(posts)
//   } catch(e){
//     console.error(e)
//   }
// })



app.get('/write', (req, res) => {
  // const user = req.user ? req.user : null;
  res.render('write', { user: req.user });
});

// Multer 설정
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir); // 파일이 저장될 경로를 지정
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname)
    ); // 파일 이름 설정
  },
});

const upload = multer({ storage: storage });

app.post('/write', upload.single('postimg'), async (req, res) => {
  // const user = req.user ? req.user : null;
  const { title, content } = req.body;
  const postImg = req.file ? req.file.filename : null;
  const createAtDate = new Date();
  try {
    let db = await getDB();
    const result = await db.collection('counter').findOne({ name: 'counter' });
    // const totalPost = result ? result.totalPost : 0;
    await db.collection('posts').insertOne({
      _id: result.totalPost + 1,
      title,
      content,
      createAtDate,
      userid: req.user.userid,
      username: req.user.username,
      // userid는 변경X, username은 변경O
      postImgPath: postImg ? `/uploads/${postImg}` : null,
      // /추가해줘야함
    });

    await db
      .collection('counter')
      .updateOne({ name: 'counter' }, { $inc: { totalPost: 1 } });

    await db.collection('like').insertOne({
      post_id: result.totalPost + 1,
      likeTotal: 0,
      likeMember: []
    });
    res.redirect('/');
  } catch (error) {
    console.log(error);
  }
});

//댓글기능
app.post('/comment/:id', async (req, res) => {
  const post_id = parseInt(req.params.id);
  const { comment } = req.body;
  const createAtDate = new Date();
  console.log('-----', post_id);
  console.log('-----', createAtDate);
  console.log('-----', comment);
  try {
    const db = await getDB();
    await db.collection('comment').insertOne({
      post_id,
      comment,
      createAtDate,
      userid: req.user.userid,
      username: req.user.username,
    });
    res.json({
      ssetion: true
    });
  } catch (e) {
    console.log(e);
    res.json({ ssetion: false });
  }
});

// 일반적으로 데이터베이스에서 가져오는 데이터는 문자열 형태로 반환
app.get('/detail/:id', async (req, res) => {
  console.log(req.params.id);
  let id = parseInt(req.params.id); //_id:int (인트형이지만 다시 한 번 인트로 변환)
  try {
    const db = await getDB();
    const posts = await db.collection('posts').findOne({ _id: id });
    const like = await db.collection('like').findOne({ post_id: id });
    const comments = await db
      .collection('comment')
      .find({ post_id: id })
      .sort({ createAtDate: -1 })
      .toArray();
    // [posts:posts 축약버전] + ★login되어있는 userid로 설계필요
    res.render('detail', { posts, user: req.user, like, comments });
    // 파일이름 index->detail 수정
  } catch (error) {
    console.log(error);
  }
});

//리스트 삭제기능
app.post('/del/:id', async (req, res) => {
  let id = parseInt(req.params.id);
  try {
    const db = await getDB();
    await db.collection('posts').deleteOne({ _id: id });
    res.redirect('/');
  } catch (e) {
    console.error(e); //detail파일 .then((res) => {} 부분과 연동
  }
});

//수정페이지로 데이터 바인딩(두 가지 객체 또는 데이터 소스 간의 연결)
app.get('/edit/:id', async (req, res) => {
  let id = parseInt(req.params.id);
  try {
    const db = await getDB();
    const posts = await db.collection('posts').findOne({ _id: id });
    // find()->findOne() 수정
    console.log(posts);
    res.render('edit', { posts, user: req.user });
  } catch (e) {
    console.error(e);
  }
});

//edit 호스팅요청이 들어왔을 때
app.post('/edit', upload.single('postimg'), async (req, res) => {
  console.log(req.body, req.file);
  const { id, title, content, createAtDate } = req.body;
  // uploads/uploads/<< 경로 중복제거
  const postimgOld = req.body.postimgOld.replace('uploads/', '');
  //몽고DB에 업데이트
  const postImg = req.file ? req.file.filename : postimgOld;
  try {
    const db = await getDB();
    await db.collection('posts').updateOne(
      // 찾을db, 업데이트할db
      { _id: parseInt(id) },{
        $set: {
          title,
          content,
          createAtDate,
          postImgPath: postImg ? `/uploads/${postImg}` : null,
        }
      })
    res.redirect('/');
  } catch (e) {
    console.error(e);
  }
});

app.get('/signup', (req, res) => {
  // const user = req.user ? req.user : null;
  res.render('signup', { user: req.user });
});

const bcrypt = require('bcrypt');
// const { log } = require('console');
const saltRounds = 10;

app.post('/signup', async (req, res) => {
  const { userid, pw, username } = req.body;
  console.log('등록확인', req.body);

  try {
    const encryptPw = await bcrypt.hash(pw, saltRounds); //암호화
    const db = await getDB();
    await db.collection('users').insertOne({ userid, username, pw: encryptPw });
    res.redirect('/login');
  } catch (error) {
    console.log(error);
  }
});

//로그인페이지
app.get('/login', (req, res) => {
  // const user = req.user ? req.user : null;
  res.render('login', { user: req.user });
});

app.post('/login', async (req, res) => {
  const { userid, pw } = req.body;

  try {
    const db = await getDB();
    const user = await db.collection('users').findOne({ userid });
    console.log('---', req.body, user);

    if (user) {
      const compareResult = await bcrypt.compare(pw, user.pw);
      if (compareResult) {
        const token = jwt.sign({ userid: user.userid }, SECRET);
        res.cookie('token', token);
        res.redirect('/');
      } else {
        // res.send('ID:test1 있는 경우');
        res.status(401).send();
      }
    } else {
      // res.send('ID:test1 없는 경우');
      res.status(404).send();
    }
  } catch (e) {
    console.error(e);
  }
});

app.get('/logout', (req, res) => {
  res.clearCookie('token');
  // readdirSync.redirect('/');
  res.redirect('/');
});

//persoanl 개인페이지
app.get('/personal/:userid', async (req, res) => {
  // const user = req.user ? req.user : null;
  const postUser = req.params.userid;
  try {
    const db = await getDB();
    const posts = await db
      .collection('posts')
      .find({ userid: postUser })
      .toArray();
    console.log(postUser, posts);
    res.render('personal', { posts, postUser, user: req.user });
  } catch (e) {
    console.error;
  }
});

//마이페이지
app.get('/mypage', (req, res) => {
  console.log(req.user);
  res.render('mypage', { user: req.user });
});

// 좋아요 기능 (/like/2)
app.post('/like/:id', async (req, res) => {
  const postid = parseInt(req.params.id); //글쓴이
  const userid = req.user.userid; // 로그인
  try {
    const db = await getDB();
    const like = await db.collection('like').findOne({ post_id: postid });
    if (like.likeMember.includes(userid)) {
      //이미 좋아요 누른 경우
      await db.collection('like').updateOne(
        { post_id: postid },
        {
          $inc: { likeTotal: -1 },
          // $push: { likeMember: userid },
          $pull: { likeMember: userid },
        }
      );
    } else {
      // const db = await getDB();
      await db.collection('like').updateOne(
        { post_id: postid },
        {
          $inc: { likeTotal: 1 },
          $push: { likeMember: userid },
        }
      );
    }
    res.redirect('/detail/' + postid);
  } catch (e) {
    console.error(e);
  }
});

app.listen(port, () => {
  console.log(`서버동작 ${port}`);
});

