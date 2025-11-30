// game.js - 单人模式稳定版 (修复碰撞、怪物刷新，并美化 UI/HUD)

(function() {
    'use strict';

    // =========================================================
    // --- 核心配置 (单人模式) ---
    // =========================================================
    let localPlayerInstance = null;
    let globalMonsterIdCounter = 0;
    
    // 初始化 Canvas 和 Context
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) {
        console.error("Canvas element with ID 'gameCanvas' not found. Please check your index.html.");
        return;
    }
    const ctx = canvas.getContext('2d');
    canvas.width = 1000;
    canvas.height = 600;

    // 游戏状态和常量
    const GRAVITY = 1.0;
    const MAX_JUMP_HEIGHT = 17;
    let score = 0;
    let gameOver = false;
    let isPaused = false;
    
    const HEALTH_COST = 200;
    const HEALTH_RESTORE = 50;

    // 波次管理
    let wave = 1;
    let waveActive = true;
    const MAX_MONSTERS_PER_WAVE = 5;

    // 全局对象数组
    const platforms = [];
    const monsters = [];
    const bullets = [];
    const floatingTexts = [];
    const explosions = [];
    const keys = {};

    // 鼠标状态
    let mousePos = { x: canvas.width / 2, y: canvas.height / 2 };
    let lastShotManual = false;

    // 玩家出生点信息（用于怪物排除区）
    const SPAWN_AREA = { x: 0, y: 0, w: 0, h: 0 };
    const SAFE_DISTANCE = 400; // 怪物必须距离玩家 400 像素以外生成

    // 怪物警戒范围
    const AGGRO_RANGE = 300;

    // --- 枪械数据配置 ---
    const WEAPON_SPECS = {
        AWM: { name: "AWM", damage: 100, fireRate: 60, auto: false, bulletSpeed: 25, color: 'brown', fireOffset: 20, moveSpeedModifier: -0.25 },
        M7: { name: "M7", damage: 25, fireRate: 7, auto: true, bulletSpeed: 17, color: 'gray', fireOffset: 15, moveSpeedModifier: 0.00 },
        S12K: {
            name: "S12K", damage: 10, fireRate: 18, auto: true, pellets: 10, bulletSpeed: 12, color: 'orange',
            fireOffset: 10, moveSpeedModifier: -0.05, explosionRadius: 40
        },
        G18: { name: "G18", damage: 7, fireRate: 3, auto: true, bulletSpeed: 18, color: 'black', fireOffset: 10, moveSpeedModifier: 0.00 },
        M250: { name: "M250", damage: 25, fireRate: 5, auto: true, bulletSpeed: 30, color: 'purple', fireOffset: 25, moveSpeedModifier: -0.15 },
        CROSSBOW: { name: "复合弓", damage: 50, fireRate: 120, auto: false, bulletSpeed: 18, color: 'lime', fireOffset: 15, pierceLimit: 5, moveSpeedModifier: 0.00 },
        VECTOR: { name: "维克托", damage: 5, fireRate: 2, auto: true, bulletSpeed: 16, color: 'darkblue', fireOffset: 10, moveSpeedModifier: 0.00 }
    };
    const WEAPON_KEYS = ['AWM', 'M7', 'S12K', 'G18', 'M250', 'CROSSBOW', 'VECTOR'];
    
    // --- 护甲数据配置 ---
    const ARMOR_SPECS = {
        'HPHONE': { name: "耳机头", protection: 0.05, cost: 100, color: '#ecf0f1' },
        'MHS': { name: "MHS战术头盔", protection: 0.15, cost: 300, color: '#7f8c8d' },
        'DICH1': { name: "DICH-1战术头盔", protection: 0.25, cost: 600, color: '#34495e' },
        'H01': { name: "H01防暴头盔", protection: 0.35, cost: 1200, color: '#2ecc71' },
        'GN': { name: "GN重型头盔", protection: 0.50, cost: 2000, color: '#e67e22' },
        'H70': { name: "H70精英头盔", protection: 0.70, cost: 3500, color: '#9b59b6' },
        'DICH9': { name: "DICH-9战术头盔", protection: 0.90, cost: 5000, color: '#c0392b' }
    };
    const ARMOR_KEYS = ['HPHONE', 'MHS', 'DICH1', 'H01', 'GN', 'H70', 'DICH9'];

    function getRandomColor() {
        const letters = '0123456789ABCDEF';
        let color = '#';
        for (let i = 0; i < 6; i++) {
            color += letters[Math.floor(Math.random() * 16)];
        }
        return color;
    }
    
    function broadcastMonsterDamage(monsterId, damage) {
        const monsterToDamage = monsters.find(m => m.id === monsterId);
        if (monsterToDamage && monsterToDamage.health > 0) {
            monsterToDamage.health -= damage;
            
            if (monsterToDamage.health <= 0) {
                score += 10;
                const index = monsters.findIndex(m => m.id === monsterId);
                if (index > -1) {
                     monsters.splice(index, 1);
                }
            }
            
            floatingTexts.push(new FloatingText(
                monsterToDamage.x + monsterToDamage.width / 2,
                monsterToDamage.y,
                damage,
                'red'
            ));
        }
    }

    // --- 游戏对象类定义 ---

    class FloatingText {
        constructor(x, y, text, color = 'red') {
            this.x = x;
            this.y = y;
            this.text = text.toFixed(0);
            this.color = color;
            this.velY = -1;
            this.life = 60;
            this.opacity = 1.0;
        }
        update() {
            this.y += this.velY;
            this.life--;
            this.opacity = this.life / 60;
        }

        draw() {
            ctx.save();
            ctx.fillStyle = this.color;
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.globalAlpha = this.opacity;
            ctx.fillText(this.text, this.x, this.y);
            ctx.restore();
        }
    }

    class Platform {
        constructor(x, y, w, h) {
            this.x = x;
            this.y = y;
            this.width = w;
            this.height = h;
            this.color = '#27ae60';
        }

        draw() {
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
    }

    class Explosion {
        constructor(x, y, radius, damage) {
            this.x = x;
            this.y = y;
            this.radius = radius;
            this.damage = damage;
            this.life = 10;
            this.maxLife = 10;
            this.color = 'orange';
            this.targetsHit = new Set();
        }

        update() {
            this.life--;
        }

        draw() {
            const alpha = this.life / this.maxLife;
            const currentRadius = this.radius * (1 - alpha * 0.5);
            
            ctx.save();
            ctx.fillStyle = this.color;
            ctx.globalAlpha = alpha * 0.7;
            ctx.beginPath();
            ctx.arc(this.x, this.y, currentRadius, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.globalAlpha = alpha * 0.9;
            ctx.strokeStyle = 'yellow';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x, this.y, currentRadius, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.restore();
        }

        checkMonsterCollision(monster) {
            if (this.targetsHit.has(monster)) {
                return false;
            }

            const centerX = monster.x + monster.width / 2;
            const centerY = monster.y + monster.height / 2;

            const dx = centerX - this.x;
            const dy = centerY - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < this.radius) {
                this.targetsHit.add(monster);
                
                const normalizedDistance = distance / this.radius;
                const damageMultiplier = 1 - normalizedDistance * 0.5;
                const finalDamage = this.damage * damageMultiplier;
                
                return finalDamage;
            }
            return false;
        }
    }

    /** 玩家对象 (平台碰撞修复) */
    class Player {
        constructor(name, color) {
            this.name = name;
            this.color = color;
            this.width = 20;
            this.height = 40;
            this.x = 50;
            this.y = 100;
            this.velX = 0;
            this.velY = 0;
            this.baseSpeed = 5;
            this.airControlFactor = 0.5;
            this.isOnGround = false;
            this.isFacingRight = true;
            this.health = 150;
            this.maxHealth = 150;
            this.currentWeapon = WEAPON_SPECS.M7;
            this.fireCooldown = 0;
            this.armor = null;
        }

        switchWeapon(name) {
            if (WEAPON_SPECS[name]) {
                this.currentWeapon = WEAPON_SPECS[name];
            }
        }

        update() {
            if (this.health <= 0) return;

            const speedModifier = this.currentWeapon.moveSpeedModifier || 0;
            const actualSpeed = this.baseSpeed * (1 + speedModifier);
            const currentAcceleration = this.isOnGround ? actualSpeed : actualSpeed * this.airControlFactor;

            let targetVelX = 0;
            if (keys['a']) {
                targetVelX = -currentAcceleration;
                this.isFacingRight = false;
            }
            if (keys['d']) {
                targetVelX = currentAcceleration;
                this.isFacingRight = true;
            }

            if (this.isOnGround) {
                this.velX = targetVelX;
            } else {
                if (targetVelX !== 0) {
                    if (Math.sign(targetVelX) === Math.sign(this.velX)) {
                        if (Math.abs(this.velX) < Math.abs(targetVelX)) {
                            this.velX += Math.sign(targetVelX) * 0.5;
                        }
                    } else {
                        this.velX += targetVelX * 0.3;
                    }
                } else {
                    this.velX *= 0.98;
                }
            }
            
            // X 轴移动和边界检查
            this.x += this.velX;
            this.x = Math.max(0, Math.min(canvas.width - this.width, this.x));
            
            // Y 轴重力/移动
            this.velY += GRAVITY;
            this.y += this.velY;
            this.isOnGround = false;
            this.y = Math.max(0, this.y);

            // 平台碰撞：只检查 Y 轴碰撞
            platforms.forEach(p => {
                const horizontalOverlap = (this.x < p.x + p.width && this.x + this.width > p.x);
                
                if (horizontalOverlap) {
                    // 玩家从上方接触平台 (向下运动)
                    if (this.y + this.height > p.y && this.y + this.height <= p.y + p.height && this.velY >= 0) {
                        this.y = p.y - this.height;
                        this.velY = 0;
                        this.isOnGround = true;
                    }
                    // 玩家从下方撞到平台 (向上运动)
                    else if (this.y < p.y + p.height && this.y > p.y && this.velY < 0) {
                         this.y = p.y + p.height;
                         this.velY = 0;
                    }
                }
            });

            if (this.fireCooldown > 0) {
                this.fireCooldown--;
            }
        }
        
        draw() {
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x, this.y, this.width, this.height);
            
            ctx.fillStyle = 'white';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(this.name, this.x + this.width / 2, this.y - 20);

            if (this.armor) {
                ctx.fillStyle = this.armor.color;
                ctx.fillRect(this.x, this.y, this.width, 10);
            }

            ctx.fillStyle = this.currentWeapon.color;
            const armX = this.isFacingRight ? this.x + this.width : this.x - 5;
            ctx.fillRect(armX, this.y + 15, 20, 5);
        }
        
        // ** UI 美化：图形化血条和护甲条 **
        drawHealthBar() {
            // HUD 绘制位置（固定在左下角附近）
            const x = 20;
            const y = canvas.height - 40;
            const width = 200;
            const height = 15;
            const ratio = this.health / this.maxHealth;
            
            // 绘制血条背景
            ctx.fillStyle = '#1c2833'; // 深色背景
            ctx.fillRect(x, y, width, height);
            
            // 绘制血条
            ctx.fillStyle = ratio > 0.6 ? '#2ecc71' : (ratio > 0.3 ? '#f39c12' : '#e74c3c');
            ctx.fillRect(x, y, width * ratio, height);

            // 绘制血条边框
            ctx.strokeStyle = '#ecf0f1';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, width, height);

            // 绘制血量值文本
            ctx.fillStyle = 'white';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`${this.health.toFixed(0)} / ${this.maxHealth}`, x + width / 2, y + height - 2);


            // 绘制护甲条 (叠加在血条上方)
            if (this.armor) {
                // 护甲视觉比例：我们用双倍的保护值来拉伸长度，但最大不超过血条宽度
                const protectionRatio = this.armor.protection * 2;
                const armorWidth = Math.min(width * protectionRatio, width);

                ctx.fillStyle = this.armor.color;
                ctx.globalAlpha = 0.6; // 半透明
                ctx.fillRect(x, y - height, armorWidth, height);
                ctx.globalAlpha = 1.0;
                
                ctx.strokeStyle = this.armor.color;
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y - height, armorWidth, height);
                
                // 护甲文本
                ctx.fillStyle = 'white';
                ctx.font = '10px Arial';
                ctx.textAlign = 'left';
                ctx.fillText(`${this.armor.name} (${(this.armor.protection * 100).toFixed(0)}%)`, x + 5, y - 5);
            }
        }
        
        takeDamage(damage) {
            let finalDamage = damage;
            if (this.armor) {
                finalDamage = damage * (1 - this.armor.protection);
            }
            
            this.health -= finalDamage;
            if (this.health <= 0) {
                this.health = 0;
                gameOver = true;
            }
        }
    }

    /** 怪物对象 (平台碰撞修复) */
    class Monster {
        constructor(x, y, health, color, name) {
            this.id = 'm_' + globalMonsterIdCounter++;
            this.width = 30;
            this.height = 30;
            this.x = x;
            this.y = y;
            this.velY = 0;
            this.health = health;
            this.maxHealth = health;
            this.speed = 1.5;
            this.color = color;
            this.name = name;
            this.isFacingRight = true;
        }

        applyGravity() {
            this.velY += GRAVITY;
            this.y += this.velY;
            
            let onPlatform = false;
            platforms.forEach(p => {
                // 碰撞检测 (同玩家的平台碰撞逻辑)
                const horizontalOverlap = (this.x < p.x + p.width && this.x + this.width > p.x);

                if (horizontalOverlap) {
                    if (this.y + this.height > p.y && this.y + this.height <= p.y + p.height && this.velY >= 0) {
                        this.y = p.y - this.height;
                        this.velY = 0;
                        onPlatform = true;
                    }
                }
            });
            if (!onPlatform) {
                if (this.y + this.height > canvas.height) {
                    this.y = canvas.height - this.height;
                    this.velY = 0;
                }
            }
        }
        
        move() {
            if (!localPlayerInstance) return;

            const dx = localPlayerInstance.x - this.x;
            const distance = Math.sqrt(dx * dx);
            
            if (distance < AGGRO_RANGE) {
                this.isFacingRight = localPlayerInstance.x > this.x;
                if (Math.abs(dx) > 50) {
                    this.x += this.isFacingRight ? this.speed : -this.speed;
                }
            }
            this.x = Math.max(0, Math.min(canvas.width - this.width, this.x));
        }
        
        update() {
            if (this.health <= 0) return;
            this.applyGravity();
            this.move();
        }
        
        draw() {
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x, this.y, this.width, this.height);
            this.drawHealthBar();
        }
        
        drawHealthBar() {
            const ratio = this.health / this.maxHealth;
            ctx.fillStyle = 'gray';
            ctx.fillRect(this.x, this.y - 10, this.width, 4);
            ctx.fillStyle = ratio > 0.5 ? 'green' : (ratio > 0.2 ? 'orange' : 'red');
            ctx.fillRect(this.x, this.y - 10, this.width * ratio, 4);
        }
    }

    class Walker extends Monster {
        constructor(x, y) {
            super(x, y, 20, '#e74c3c', '步行者');
            this.contactDamage = 5;
        }
    }

    class Shooter extends Monster {
        constructor(x, y) {
            super(x, y, 40, '#f1c40f', '射击者');
            this.weapon = WEAPON_SPECS.G18;
            this.fireCooldown = 0;
            this.speed = 1;
            this.MAX_RANGE = 250;
        }

        update() {
            super.update();
            if (this.health <= 0 || !localPlayerInstance) return;
            
            this.fireCooldown--;
            
            const dx = localPlayerInstance.x - this.x;
            const dy = localPlayerInstance.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < this.MAX_RANGE && this.fireCooldown <= 0) {
                this.shoot(dx, dy);
                this.fireCooldown = this.weapon.fireRate * 2;
            }
        }
        
        shoot(dx, dy) {
            const startX = this.x + this.width / 2;
            const startY = this.y + this.height / 2;
            
            const angle = Math.atan2(dy, dx);
            const velX = Math.cos(angle) * this.weapon.bulletSpeed;
            const velY = Math.sin(angle) * this.weapon.bulletSpeed;
            
            bullets.push(new Bullet(
                startX,
                startY,
                this.weapon.damage,
                velX,
                velY,
                true // isEnemy = true
            ));
        }
        
        draw() {
            super.draw();
            ctx.fillStyle = this.weapon.color;
            const armX = this.isFacingRight ? this.x + this.width : this.x - 5;
            ctx.fillRect(armX, this.y + 10, 15, 3);
        }
    }

    class Bullet {
        constructor(x, y, damage, velX, velY, isEnemy = false, pierceLimit = 0, isExplosive = false, explosionRadius = 0) {
            this.x = x;
            this.y = y;
            this.damage = damage;
            this.velX = velX;
            this.velY = velY;
            this.radius = 3;
            this.color = isEnemy ? 'red' : (isExplosive ? 'gold' : 'yellow');
            this.isEnemy = isEnemy;
            this.pierceCount = pierceLimit;
            this.isExplosive = isExplosive;
            this.explosionRadius = explosionRadius;
        }

        update() {
            this.x += this.velX;
            this.y += this.velY;
        }

        draw() {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
        }
        
        checkCollision(target) {
            const closestX = Math.max(target.x, Math.min(this.x, target.x + target.width));
            const closestY = Math.max(target.y, Math.min(this.y, target.y + target.height));

            const dx = this.x - closestX;
            const dy = this.y - closestY;

            const distanceSq = (dx * dx) + (dy * dy);
            
            return distanceSq < (this.radius * this.radius);
        }
        
        checkPlatformCollision(platform) {
            const closestX = Math.max(platform.x, Math.min(this.x, platform.x + platform.width));
            const closestY = Math.max(platform.y, Math.min(this.y, platform.y + platform.height));

            const dx = this.x - closestX;
            const dy = this.y - closestY;

            const distanceSq = (dx * dx) + (dy * dy);
            return distanceSq < (this.radius * this.radius);
        }
    }

    function handleShoot(weapon, targetX, targetY) {
        if (!localPlayerInstance || localPlayerInstance.fireCooldown > 0) return;

        localPlayerInstance.fireCooldown = weapon.fireRate;

        const startX = localPlayerInstance.x + localPlayerInstance.width / 2;
        const startY = localPlayerInstance.y + localPlayerInstance.height / 2;
        
        const angle = Math.atan2(targetY - startY, targetX - startX);
        localPlayerInstance.isFacingRight = (targetX > startX);

        const baseVelX = Math.cos(angle) * weapon.bulletSpeed;
        const baseVelY = Math.sin(angle) * weapon.bulletSpeed;
        
        const pierceLimit = weapon.name === '复合弓' ? 5 : 0;
        
        const isExplosive = weapon.name === 'S12K';
        const explosionRadius = weapon.explosionRadius || 0;

        if (weapon.name === 'S12K') {
            const numPellets = weapon.pellets;
            for (let i = 0; i < numPellets; i++) {
                const angleOffset = (Math.random() - 0.5) * 0.7;
                const spreadAngle = angle + angleOffset;
                const spreadVelX = Math.cos(spreadAngle) * weapon.bulletSpeed;
                const spreadVelY = Math.sin(spreadAngle) * weapon.bulletSpeed;
                
                bullets.push(new Bullet(
                    startX + Math.cos(angle) * weapon.fireOffset,
                    startY,
                    weapon.damage,
                    spreadVelX,
                    spreadVelY,
                    false,
                    0,
                    isExplosive,
                    explosionRadius
                ));
            }
        } else {
            bullets.push(new Bullet(
                startX + Math.cos(angle) * weapon.fireOffset,
                startY + Math.sin(angle) * weapon.fireOffset,
                weapon.damage,
                baseVelX,
                baseVelY,
                false,
                pierceLimit,
                isExplosive,
                explosionRadius
            ));
        }
    }

    // --- 商店/暂停系统函数 ---
    function buyHealth() {
        if (!localPlayerInstance) return;
        if (score >= HEALTH_COST && localPlayerInstance.health < localPlayerInstance.maxHealth) {
            score -= HEALTH_COST;
            localPlayerInstance.health += HEALTH_RESTORE;
            
            if (localPlayerInstance.health > localPlayerInstance.maxHealth) {
                localPlayerInstance.health = localPlayerInstance.maxHealth;
            }
        }
    }

    function drawShop() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#f39c12';
        ctx.font = '40px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('游戏暂停 - 商店', canvas.width / 2, 80);

        ctx.fillStyle = 'white';
        ctx.font = '24px Arial';
        ctx.fillText(`当前积分: ${score}`, canvas.width / 2, 130);
        
        // --- 商店区 ---
        ctx.textAlign = 'left';
        ctx.font = '30px Arial';
        ctx.fillStyle = '#3498db';
        ctx.fillText('⚡ 商店', 50, 190);
        
        ctx.font = '20px Arial';
        const startY = 250;
        const padding = 40;
        
        // 1. 回血选项
        const canBuyHealth = score >= HEALTH_COST && localPlayerInstance && localPlayerInstance.health < localPlayerInstance.maxHealth;
        ctx.fillStyle = canBuyHealth ? 'lime' : 'white';
        ctx.fillText(`[0] 回复血量: +${HEALTH_RESTORE} HP`, 50, startY);
        
        ctx.fillStyle = 'yellow';
        ctx.fillText(`价格: ${HEALTH_COST} 积分`, 450, startY);
        
        // 2. 护甲选项
        const armorStartY = startY + padding;
        ARMOR_KEYS.forEach((key, index) => {
            const spec = ARMOR_SPECS[key];
            const displayIndex = index + 1;
            const isCurrent = localPlayerInstance && localPlayerInstance.armor && localPlayerInstance.armor.name === spec.name;
            let canUpgrade = true;

            if (localPlayerInstance && localPlayerInstance.armor) {
                canUpgrade = spec.protection > localPlayerInstance.armor.protection;
            } else {
                canUpgrade = true;
            }
            
            const canBuy = score >= spec.cost && canUpgrade;

            ctx.fillStyle = isCurrent ? '#2ecc71' : (canBuy ? '#3498db' : 'white');
            ctx.fillText(`[${displayIndex}] ${spec.name}`, 50, armorStartY + index * padding);
            
            ctx.fillStyle = canBuy ? 'lime' : 'yellow';
            ctx.fillText(`价格: ${spec.cost} 积分`, 450, armorStartY + index * padding);
        });
        
        // --- 底部控制提示 ---
        ctx.textAlign = 'center';
        ctx.fillStyle = 'red';
        ctx.font = '24px Arial';
        ctx.fillText('按 P 继续游戏。', canvas.width / 2, canvas.height - 50);
    }

    function buyArmor(index) {
        if (!localPlayerInstance) return;
        const key = ARMOR_KEYS[index];
        if (!key) return;
        
        const spec = ARMOR_SPECS[key];
        let canUpgrade = true;

        if (localPlayerInstance.armor) {
            canUpgrade = spec.protection > localPlayerInstance.armor.protection;
        }

        if (score >= spec.cost && canUpgrade) {
            score -= spec.cost;
            localPlayerInstance.armor = spec;
        }
    }

    // --- 关卡和波次管理函数 ---
    function checkOverlap(newPlatform) {
        for (const p of platforms) {
            if (newPlatform.x < p.x + p.width &&
                newPlatform.x + newPlatform.width > p.x &&
                newPlatform.y < p.y + p.height &&
                newPlatform.y + newPlatform.height > p.y) {
                return true;
            }
        }
        if (newPlatform.x < SPAWN_AREA.x + SPAWN_AREA.w + 100 &&
            newPlatform.x + newPlatform.width > SPAWN_AREA.x - 100 &&
            newPlatform.y < SPAWN_AREA.y + SPAWN_AREA.h + 50 &&
            newPlatform.y + newPlatform.height > SPAWN_AREA.y - 50) {
            return true;
        }
        return false;
    }

    function createConnectedPlatform(referencePlatform) {
        const minW = 100;
        const maxW = 200;
        const minH = 15;
        const maxH = 25;
        
        const MAX_JUMP_DIFF = MAX_JUMP_HEIGHT * MAX_JUMP_HEIGHT / (2 * GRAVITY) * 0.8;

        let newPlatform = {};
        let attempts = 0;
        const maxAttempts = 50;

        while (attempts < maxAttempts) {
            attempts++;

            const w = Math.random() * (maxW - minW) + minW;
            const h = Math.random() * (maxH - minH) + minH;
            
            const minY = Math.max(50, referencePlatform.y - MAX_JUMP_DIFF);
            const maxY = referencePlatform.y + 50;
            const y = Math.random() * (maxY - minY) + minY;

            let x;
            if (Math.random() > 0.5) {
                const minX = referencePlatform.x + referencePlatform.width - w * 0.5;
                const maxX = referencePlatform.x + referencePlatform.width + 100;
                x = Math.random() * (maxX - minX) + minX;
            } else {
                const minX = referencePlatform.x - 100 - w;
                const maxX = referencePlatform.x + w * 0.5;
                x = Math.random() * (maxX - minX) + minX;
            }
            
            x = Math.max(10, Math.min(canvas.width - 10 - w, x));
            
            newPlatform = { x, y, width: w, height: h };

            if (!checkOverlap(newPlatform)) {
                platforms.push(new Platform(newPlatform.x, newPlatform.y, newPlatform.width, newPlatform.height));
                return platforms[platforms.length - 1];
            }
        }
        return null;
    }

    function setupLevel() {
        platforms.length = 0;
        
        platforms.push(new Platform(0, canvas.height - 50, canvas.width, 50));
        
        const spawnW = 250;
        const spawnH = 20;
        const spawnX = canvas.width / 2 - spawnW / 2;
        const spawnY = canvas.height - 150;
        
        const initialPlatform = new Platform(spawnX, spawnY, spawnW, spawnH);
        platforms.push(initialPlatform);
        
        SPAWN_AREA.x = spawnX;
        SPAWN_AREA.y = spawnY;
        SPAWN_AREA.w = spawnW;
        SPAWN_AREA.h = spawnH;
        
        // 初始化本地玩家
        if (!localPlayerInstance) {
            localPlayerInstance = new Player("您的玩家", getRandomColor());
        }
        
        localPlayerInstance.x = spawnX + spawnW / 2 - localPlayerInstance.width / 2;
        localPlayerInstance.y = spawnY - localPlayerInstance.height;
        localPlayerInstance.velY = 0;

        let currentRef = initialPlatform;
        const numPlatforms = 4 + wave * 2;

        for (let i = 0; i < numPlatforms; i++) {
            const newPlatform = createConnectedPlatform(currentRef);
            if (newPlatform) {
                currentRef = newPlatform;
            } else {
                if (platforms.length > 2) {
                    const randomIndex = 1 + Math.floor(Math.random() * (platforms.length - 2));
                    currentRef = platforms[randomIndex];
                    i--;
                }
            }
        }
    }

    function spawnMonsters() {
        monsters.length = 0;
        globalMonsterIdCounter = 0;

        const numMonsters = MAX_MONSTERS_PER_WAVE + wave * 2;
        
        for (let i = 0; i < numMonsters; i++) {
            let x;
            let y = 100;
            
            let attempts = 0;
            let spawnOk = false;
            
            while (!spawnOk && attempts < 50) {
                x = Math.random() * (canvas.width - 150) + 75;
                attempts++;
                
                spawnOk = true;
                
                // 怪物生成修复：检查是否离玩家太近
                const dx = localPlayerInstance.x - x;
                const dy = localPlayerInstance.y - y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < SAFE_DISTANCE) {
                    spawnOk = false;
                }
            }
            
            if (!spawnOk) {
                x = (i % 2 === 0) ? 50 : canvas.width - 50;
            }

            const isShooter = Math.random() < (0.2 + wave * 0.1);

            if (isShooter) {
                monsters.push(new Shooter(x, y));
            } else {
                monsters.push(new Walker(x, y));
            }
        }
        
        waveActive = true;
    }

    function startNextWave() {
        wave++;
        setupLevel();
        spawnMonsters();
        isPaused = false;
        console.log(`--- 第 ${wave} 波开始！ ---`);
    }

    function initGame() {
        setupLevel();
        spawnMonsters();
        if (localPlayerInstance) {
            localPlayerInstance.name = "您的玩家";
        }
        gameLoop();
    }


    // --- 游戏循环 ---
    function gameLoop() {
        if (isPaused) {
            drawShop();
            requestAnimationFrame(gameLoop);
            return;
        }
        
        if (gameOver) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'red';
            ctx.font = '80px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('游戏结束', canvas.width / 2, canvas.height / 2);
            ctx.font = '40px Arial';
            ctx.fillText(`最终得分: ${score}`, canvas.width / 2, canvas.height / 2 + 70);
            return;
        }

        // 1. 绘制背景和平台
        ctx.fillStyle = '#34495e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        platforms.forEach(p => p.draw());

        // 2. 更新玩家
        if (localPlayerInstance) {
            localPlayerInstance.update();
            
            // 3. 玩家射击逻辑
            if (keys['shoot']) {
                const weapon = localPlayerInstance.currentWeapon;
                const isManual = !weapon.auto;
                
                if (isManual) {
                    if (!lastShotManual && localPlayerInstance.fireCooldown <= 0) {
                        handleShoot(weapon, mousePos.x, mousePos.y);
                        lastShotManual = true;
                    }
                } else {
                    if (localPlayerInstance.fireCooldown <= 0) {
                        handleShoot(weapon, mousePos.x, mousePos.y);
                    }
                }
            } else {
                lastShotManual = false;
            }
        }
        
        // 4. 更新怪物
        monsters.forEach(monster => monster.update());
        
        // 5. 更新子弹和碰撞检测
        for (let i = bullets.length - 1; i >= 0; i--) {
            const bullet = bullets[i];
            bullet.update();

            let removed = false;
            
            // 平台碰撞
            for (let j = 0; j < platforms.length; j++) {
                const platform = platforms[j];
                if (bullet.checkPlatformCollision(platform)) {
                    if (bullet.isExplosive) {
                        explosions.push(new Explosion(bullet.x, bullet.y, bullet.explosionRadius, bullet.damage));
                    }
                    removed = true;
                    break;
                }
            }
            if (removed) {
                bullets.splice(i, 1);
                continue;
            }

            // 玩家子弹对怪物
            if (!bullet.isEnemy) {
                for (let j = monsters.length - 1; j >= 0; j--) {
                    const monster = monsters[j];
                    const hit = bullet.checkCollision(monster);
                    
                    if (hit) {
                        broadcastMonsterDamage(monster.id, bullet.damage);
                        
                        if (bullet.isExplosive) {
                            explosions.push(new Explosion(bullet.x, bullet.y, bullet.explosionRadius, bullet.damage));
                            removed = true;
                            break;
                        } else if (bullet.pierceCount > 0) {
                            bullet.pierceCount--;
                        } else {
                            removed = true;
                        }
                        break;
                    }
                }
            }
            
            // 怪物子弹对玩家
            if (bullet.isEnemy) {
                if (localPlayerInstance && localPlayerInstance.health > 0) {
                    if (bullet.checkCollision(localPlayerInstance)) {
                        const receivedDamage = bullet.damage;
                        localPlayerInstance.takeDamage(receivedDamage);
                        
                         floatingTexts.push(new FloatingText(
                            localPlayerInstance.x + localPlayerInstance.width / 2,
                            localPlayerInstance.y,
                            receivedDamage,
                            'red'
                        ));
                        removed = true;
                    }
                }
            }
            
            if (removed || bullet.x < -10 || bullet.x > canvas.width + 10 || bullet.y < -10 || bullet.y > canvas.height + 10) {
                bullets.splice(i, 1);
            }
        }
        
        // 6. 爆炸处理
        for (let i = explosions.length - 1; i >= 0; i--) {
           const exp = explosions[i];
           exp.update();
           
           if (exp.life > 0) {
                monsters.forEach(m => {
                    const damage = exp.checkMonsterCollision(m);
                    if (damage) {
                        broadcastMonsterDamage(m.id, damage);
                    }
                });
           }
           
           if (exp.life <= 0) {
               explosions.splice(i, 1);
           }
        }


        // 7. 怪物对玩家的接触伤害 (Walker)
        monsters.forEach(m => {
            if (m.health > 0 && m instanceof Walker && localPlayerInstance) {
                if (localPlayerInstance.x < m.x + m.width && localPlayerInstance.x + localPlayerInstance.width > m.x &&
                    localPlayerInstance.y < m.y + m.height && localPlayerInstance.y + localPlayerInstance.height > m.y) {
                    
                    if (Math.random() < 0.05) {
                        const contactDamage = m.contactDamage;
                        localPlayerInstance.takeDamage(contactDamage);
                        
                         floatingTexts.push(new FloatingText(
                            localPlayerInstance.x + localPlayerInstance.width / 2,
                            localPlayerInstance.y,
                            contactDamage,
                            'red'
                        ));
                    }
                }
            }
        });

        // 8. 伤害文本更新和清理
        for (let i = floatingTexts.length - 1; i >= 0; i--) {
            const text = floatingTexts[i];
            text.update();
            if (text.life <= 0) {
                floatingTexts.splice(i, 1);
            }
        }
        
        // 9. 波次管理逻辑
        if (waveActive && monsters.length === 0) {
            waveActive = false;
            score += 500 * wave;
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(0, canvas.height/2 - 50, canvas.width, 100);
            ctx.fillStyle = 'lime';
            ctx.font = '40px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`第 ${wave} 波完成! 获得 ${500 * wave} 积分`, canvas.width / 2, canvas.height / 2 + 10);
            
            setTimeout(startNextWave, 3000);
        }


        // 10. 绘制所有对象
        bullets.forEach(bullet => bullet.draw());
        explosions.forEach(exp => exp.draw());
        monsters.forEach(monster => monster.draw());
        if (localPlayerInstance) {
            localPlayerInstance.draw();
        }
        floatingTexts.forEach(text => text.draw());

        // 11. 绘制 HUD
        if (localPlayerInstance) {
            // 绘制玩家图形血条和护甲条 (左下角)
            localPlayerInstance.drawHealthBar();

            // 积分和波次信息 (顶部左侧)
            ctx.fillStyle = 'white';
            ctx.font = '24px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(`⚡ ${score} 积分`, 10, 30);
            ctx.fillText(`波次: ${wave}`, 10, 60);

            // 武器信息 (顶部右侧)
            ctx.textAlign = 'right';
            ctx.fillStyle = localPlayerInstance.currentWeapon.color;
            ctx.font = '24px Arial';
            ctx.fillText(`⌖ ${localPlayerInstance.currentWeapon.name}`, canvas.width - 10, 30);
            ctx.font = '16px Arial';
            ctx.fillStyle = 'lightblue';
            const fireRateText = `${(60 / localPlayerInstance.currentWeapon.fireRate).toFixed(1)}发/秒`;
            ctx.fillText(`伤害: ${localPlayerInstance.currentWeapon.damage} | 射速: ${fireRateText}`, canvas.width - 10, 55);
        }

        // 控件提示 (顶部右侧下方)
        ctx.textAlign = 'right';
        ctx.fillStyle = '#bdc3c7';
        ctx.font = '14px Arial';
        ctx.fillText('移动: A/D | 跳跃: W | 瞄准/射击: 鼠标 | 暂停/商店: P', canvas.width - 10, 80);

        // 商店提示 (固定提示)
        ctx.fillStyle = 'yellow';
        ctx.font = '14px Arial';
        ctx.fillText('商店提示: [0] 回血 | [1-7] 护甲 | [1-7] 切换武器', canvas.width - 10, 100);

        // 12. 请求下一帧动画
        requestAnimationFrame(gameLoop);
    }
    
    // --- 事件监听器 ---
    document.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        
        if (key === 'p' || key === 'escape') {
            isPaused = !isPaused;
            if (!isPaused) {
                keys['shoot'] = false;
                lastShotManual = false;
            }
            return;
        }

        keys[key] = true;
        
        if (isPaused && localPlayerInstance) {
            const numKey = parseInt(e.key);
            
            if (e.key === '0') {
                buyHealth();
            } else if (numKey >= 1 && numKey <= ARMOR_KEYS.length) {
                buyArmor(numKey - 1);
            }
            return;
        }
        
        if (key === 'w' && localPlayerInstance && localPlayerInstance.isOnGround) {
            localPlayerInstance.velY = -MAX_JUMP_HEIGHT;
            localPlayerInstance.isOnGround = false;
        }
        
        const numKey = parseInt(e.key);
        if (numKey >= 1 && numKey <= WEAPON_KEYS.length && localPlayerInstance) {
            localPlayerInstance.switchWeapon(WEAPON_KEYS[numKey - 1]);
        }
    });

    document.addEventListener('keyup', (e) => {
        keys[e.key.toLowerCase()] = false;
    });

    canvas.addEventListener('mousemove', (e) => {
        mousePos.x = e.clientX - canvas.offsetLeft;
        mousePos.y = e.clientY - canvas.offsetTop;
    });

    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0 && !isPaused) {
            keys['shoot'] = true;
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        if (e.button === 0) {
            keys['shoot'] = false;
        }
    });

    // 启动游戏
    initGame();
})();
