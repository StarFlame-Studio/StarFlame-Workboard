<template>
  <div class="board-skel" aria-busy="true" aria-live="polite">
    <!-- 左侧时间/出勤栏（窄屏隐藏） -->
    <aside class="board-skel-rail">
      <div class="board-skel-time">
        <span class="sf-skel sf-skel--text" style="width: 44%; height: 12px" />
        <span class="sf-skel sf-skel--text" style="width: 70%; height: 46px; border-radius: 10px" />
        <span class="sf-skel sf-skel--text" style="width: 54%; height: 12px" />
      </div>
      <div class="board-skel-att">
        <span class="sf-skel sf-skel--text" style="width: 40%; height: 10px" />
        <span class="sf-skel" style="width: 58%; height: 30px; border-radius: 8px" />
        <span class="sf-skel sf-skel--text" style="width: 66%; height: 10px" />
      </div>
      <div class="board-skel-quote">
        <span class="sf-skel sf-skel--text" style="width: 90%; height: 10px" />
        <span class="sf-skel sf-skel--text" style="width: 74%; height: 10px" />
        <span class="sf-skel sf-skel--text" style="width: 52%; height: 10px" />
      </div>
    </aside>

    <!-- 右侧主区：通知条 + 科目标题 + 作业卡片墙 -->
    <section class="board-skel-main">
      <div class="board-skel-notice">
        <span class="sf-skel sf-skel--circle" style="width: 18px; height: 18px" />
        <span class="sf-skel sf-skel--text" style="flex: 1; height: 12px" />
      </div>

      <div class="board-skel-head">
        <span class="sf-skel sf-skel--text" style="width: 96px; height: 18px" />
        <span class="sf-skel sf-skel--pill" style="width: 58px; height: 22px" />
        <span class="sf-skel sf-skel--pill" style="width: 42px; height: 22px; margin-left: auto" />
      </div>

      <div class="board-skel-grid">
        <div v-for="n in cards" :key="n" class="board-skel-card">
          <div class="board-skel-card-head">
            <span class="sf-skel sf-skel--circle" style="width: 22px; height: 22px" />
            <span class="sf-skel sf-skel--text" style="width: 42%; height: 13px" />
            <span class="sf-skel sf-skel--pill" style="width: 40px; height: 18px; margin-left: auto" />
          </div>
          <div class="board-skel-card-body">
            <span v-for="line in lines" :key="line" class="sf-skel sf-skel--text" :style="{ width: line + '%' }" />
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
/** 看板首屏骨架：形状与「作业墙」布局一致，加载完成后由真实内容接管。 */
withDefaults(defineProps<{ cards?: number }>(), { cards: 8 })

const lines = [94, 86, 62]
</script>

<style scoped>
.board-skel {
  display: flex;
  gap: 16px;
  padding: 16px;
  width: 100%;
  min-height: 60vh;
  animation: board-skel-in 0.28s ease both;
}

@keyframes board-skel-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.board-skel-rail {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 240px;
  flex: 0 0 240px;
}

.board-skel-time,
.board-skel-att,
.board-skel-quote,
.board-skel-notice,
.board-skel-card {
  border: 1px solid rgb(var(--v-theme-on-surface), 0.06);
  border-radius: var(--r-lg, 16px);
  background: rgb(var(--v-theme-surface), 0.55);
}

.board-skel-time {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.board-skel-att,
.board-skel-quote {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
}

.board-skel-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.board-skel-notice {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
}

.board-skel-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px 4px;
}

.board-skel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 14px;
}

.board-skel-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px;
  min-height: 132px;
}

.board-skel-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.board-skel-card-body {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

@media (max-width: 900px) {
  .board-skel {
    padding: 12px;
  }

  .board-skel-rail {
    display: none;
  }

  .board-skel-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
  }
}
</style>