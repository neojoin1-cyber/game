// Firebase 설정 (가상/테스트용 설정)
const firebaseConfig = {
    apiKey: "mock-api-key",
    authDomain: "purrfect-pet.firebaseapp.com",
    projectId: "purrfect-pet",
    storageBucket: "purrfect-pet.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:mock123"
};

// 파이어베이스 초기화 (주석 처리 또는 Mock 객체로 대체 가능)
// app = firebase.initializeApp(firebaseConfig);
// db = firebase.firestore();
// auth = firebase.auth();

let score = 0;
let isPremium = false;
let autoPetterInterval = null;

const catObj = document.getElementById('cat');
const scoreDisplay = document.getElementById('score');
const catContainer = document.getElementById('cat-container');
const loginBtn = document.getElementById('login-btn');
const playerNameDisplay = document.getElementById('player-name');
const storeBtn = document.getElementById('store-btn');
const paypalContainer = document.getElementById('paypal-button-container');

// 쓰다듬기(클릭) 이벤트
catObj.addEventListener('pointerdown', (e) => {
    // 1. 점수 증가 로직
    const increment = isPremium ? 10 : 1;
    score += increment;
    scoreDisplay.innerText = score;

    // 2. 고양이 애니메이션
    catContainer.classList.remove('pop-animation');
    void catContainer.offsetWidth; // reflow 트리거
    catContainer.classList.add('pop-animation');

    // 3. 효과음 재생
    const purrSound = document.getElementById('purr-sound');
    if (purrSound) {
        purrSound.currentTime = 0;
        purrSound.play().catch(err => console.log('사운드 자동재생 정책으로 무시됨'));
    }

    // 4. 하트 파티클 생성
    createParticle(e.clientX, e.clientY);
});

function createParticle(x, y) {
    const particle = document.createElement('div');
    const particles = ['💖', '💕', '✨', '🐾'];
    particle.innerHTML = particles[Math.floor(Math.random() * particles.length)];
    particle.className = 'particle';

    const rect = catContainer.getBoundingClientRect();
    
    // 클릭 위치나 컨테이너 중심에서 시작
    const startX = x ? x - rect.left - 20 : rect.width / 2;
    const startY = y ? y - rect.top - 20 : rect.height / 2;

    particle.style.left = `${startX + (Math.random() * 40 - 20)}px`;
    particle.style.top = `${startY}px`;
    
    catContainer.appendChild(particle);

    setTimeout(() => {
        particle.remove();
    }, 1000);
}

// 가상 로그인 기능
loginBtn.addEventListener('click', () => {
    // 실제로는 Firebase Auth 구글 로그인 트리거
    const mockUser = "냥집사" + Math.floor(Math.random() * 1000);
    playerNameDisplay.innerText = mockUser;
    loginBtn.innerText = "로그아웃";
    alert(`파이어베이스 연동 완료! 환영합니다, ${mockUser}님. \n(데이터베이스에 점수가 저장됩니다)`);
});

// 프리미엄 구매 기능 (PayPal 연동)
storeBtn.addEventListener('click', () => {
    storeBtn.style.display = 'none';
    paypalContainer.style.display = 'block';

    if (window.paypal && !paypalContainer.hasChildNodes()) {
        window.paypal.Buttons({
            createOrder: function(data, actions) {
                return actions.order.create({
                    purchase_units: [{
                        amount: {
                            value: '1.99'
                        },
                        description: "황금 츄르 (프리미엄 고양이 업그레이드)"
                    }]
                });
            },
            onApprove: function(data, actions) {
                return actions.order.capture().then(function(details) {
                    alert('결제 성공! ' + details.payer.name.given_name + '님 감사합니다!');
                    upgradeToPremium();
                });
            }
        }).render('#paypal-button-container');
    } else if (!window.paypal) {
        // SDK 로드 실패 시 테스트용 직접 업그레이드
        alert('[테스트 모드] 결제가 완료되었습니다!');
        upgradeToPremium();
    }
});

function upgradeToPremium() {
    isPremium = true;
    catObj.className = 'cat-gold';
    catObj.innerHTML = '😻'; // 표정 변화
    document.querySelector('body').style.backgroundColor = '#ffecd2';
    
    paypalContainer.style.display = 'none';
    document.querySelector('.store-desc').innerText = "황금 고양이로 업그레이드 완료! (클릭당 10점, 자동 쓰다듬기 발동)";
    
    // 자동 쓰다듬기 (초당 1회)
    if (!autoPetterInterval) {
        autoPetterInterval = setInterval(() => {
            score += 10;
            scoreDisplay.innerText = score;
            createParticle();
        }, 1000);
    }
}
