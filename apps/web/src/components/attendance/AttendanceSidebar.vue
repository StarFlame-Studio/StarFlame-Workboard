<template>
  <v-col
    v-if="studentList.length"
    :class="{ 'cursor-not-allowed': isEditingDisabled }"
    class="attendance-area no-select"
    cols="1"
    @click="handleClick"
  >
    <h1>出勤</h1>
    <h2>
      <span style="white-space: nowrap">应到</span>:
      <span style="white-space: nowrap">{{ studentList.length - attendance.excluded }}人</span>
    </h2>
    <h2>
      <span style="white-space: nowrap">实到</span>:
      <span style="white-space: nowrap">{{ presentCount }}人</span>
    </h2>
    <h2>
      <span style="white-space: nowrap">请假</span>:
      <span style="white-space: nowrap">{{ attendance.absentNames.length }}人</span>
    </h2>
    <h3 v-for="(name, index) in attendance.absentNames" :key="'absent-' + index" class="gray-text">
      {{ index + 1 }}. {{ name }}
    </h3>
    <h2>
      <span style="white-space: nowrap">迟到</span>:
      <span style="white-space: nowrap">{{ attendance.lateNames.length }}人</span>
    </h2>
    <h3 v-for="(name, index) in attendance.lateNames" :key="'late-' + index" class="gray-text">
      {{ index + 1 }}. {{ name }}
    </h3>
  </v-col>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    studentList: Array<{ id: string; name: string }>
    attendance: {
      absent: number
      excluded: number
      lateCount: number
      absentNames: string[]
      lateNames: string[]
    }
    isEditingDisabled?: boolean
    /** 迟到学生是否计入实到（班级设置 display.lateStudentsArePresent） */
    lateIsPresent?: boolean
  }>(),
  { isEditingDisabled: false, lateIsPresent: false },
)

/** 实到：应到 - 请假 - 不参与；迟到是否扣减由班级设置决定 */
const presentCount = computed(() => {
  const late = props.lateIsPresent ? 0 : props.attendance.lateCount
  return Math.max(
    0,
    props.studentList.length - props.attendance.absent - props.attendance.excluded - late,
  )
})

const emit = defineEmits<{ click: [] }>()

function handleClick(): void {
  emit('click')
}
</script>
