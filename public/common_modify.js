const hamBtn = document.querySelector('.ham');
const header = document.querySelector('.hd');
const darkmode = document.querySelector('.darkmode');

hamBtn.addEventListener('click', () => {
  header.classList.toggle('on');
});

darkmode.addEventListener('click', (e) => {
  e.target.classList.toggle('on');
  document.body.classList.toggle('dark');
});
